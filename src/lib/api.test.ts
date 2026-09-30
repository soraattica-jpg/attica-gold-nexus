import { afterEach, describe, expect, it, vi } from "vitest";
import { api, buildApiUrl, normalizeApiBaseUrl, resolveBackendUrl, type AuthUserRecord } from "@/lib/api";

const mockJsonResponse = (
  payload: unknown,
  okOrOptions: boolean | { ok?: boolean; status?: number } = true,
) => {
  const options = typeof okOrOptions === "boolean"
    ? { ok: okOrOptions }
    : okOrOptions;
  const fetchMock = vi.fn().mockResolvedValue({
    ok: options.ok ?? true,
    status: options.status ?? ((options.ok ?? true) ? 200 : 500),
    json: vi.fn().mockResolvedValue(payload),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

describe("api normalization", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("loads only the current agent's exact pending intake with cancellation", async () => {
    const workflow={callId:"CALL-1",agentId:"AG025",confirmedEndedAt:"2026-09-09T11:00:00Z",submittedAt:null};
    const fetchMock=mockJsonResponse({success:true,workflow,call:{id:"CALL-1",agentId:"AG025",callerId:"9000000000",direction:"outgoing",status:"completed"}});
    const controller=new AbortController();
    const result=await api.getPendingIntakeWorkflow("AG025",controller.signal);
    expect(result?.workflow.callId).toBe("CALL-1");
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/intake-workflow/pending?agentId=AG025"),expect.objectContaining({signal:controller.signal,cache:"no-store"}));
  });

  it.each([
    {agentId:"AG026",callId:"CALL-1",confirmedEndedAt:"2026-09-09T11:00:00Z",submittedAt:null},
    {agentId:"AG025",callId:"CALL-2",confirmedEndedAt:"2026-09-09T11:00:00Z",submittedAt:null},
    {agentId:"AG025",callId:"CALL-1",confirmedEndedAt:null,submittedAt:null},
    {agentId:"AG025",callId:"CALL-1",confirmedEndedAt:"2026-09-09T11:00:00Z",submittedAt:"2026-09-09T12:00:00Z"},
  ])("rejects unrelated, live or finalized pending intakes: %j",async(workflow)=>{
    mockJsonResponse({success:true,workflow,call:{id:"CALL-1",agentId:"AG025",callerId:"9000000000",direction:"outgoing"}});
    await expect(api.getPendingIntakeWorkflow("AG025")).rejects.toThrow("does not match");
  });

  it("normalizes malformed call payloads before returning them", async () => {
    mockJsonResponse([
      {
        id: 123,
        callerId: 9876543210,
        direction: "unexpected",
        status: "weird",
        hasRecording: "1",
        talkDurationSeconds: "42",
        followUpFlag: "yes",
        grams: 18,
        createdAt: 1712345,
      },
    ]);

    const [call] = await api.getCalls();

    expect(call).toEqual(expect.objectContaining({
      id: "123",
      callerId: "9876543210",
      direction: "outgoing",
      status: "completed",
      hasRecording: true,
      talkDurationSeconds: 42,
      followUpFlag: true,
      grams: "18",
      customerName: "",
      notes: "",
    }));
  });

  it("dedupes legacy composite-id call rows onto the canonical call id", async () => {
    mockJsonResponse([
      {
        id: "CALL-1|9876543210|2026-04-18T13:21:00.000Z",
        callerId: "9876543210",
        direction: "incoming",
        status: "completed",
        duration: "00:01",
        intakeToken: "INTAKE-CALL-CALL-1|9876543210|2026-04-18T13:21:00.000Z",
        createdAt: "2026-04-18T10:50:52.000Z",
      },
      {
        id: "CALL-1",
        callerId: "9876543210",
        direction: "incoming",
        status: "completed",
        duration: "00:01",
        notes: "Customer disconnected",
        createdAt: "2026-04-18T07:51:07.000Z",
      },
    ]);

    const calls = await api.getCalls();

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual(expect.objectContaining({
      id: "CALL-1",
      intakeToken: "INTAKE-CALL-CALL-1",
      notes: "Customer disconnected",
      duration: "00:01",
    }));
  });

  it("filters blank malformed call rows out of paginated call lists", async () => {
    mockJsonResponse({
      page: 1,
      limit: 30,
      total: 2,
      totalPages: 1,
      results: [
        {
          id: "CALL-2",
          callerId: "9876543210",
          direction: "incoming",
          status: "completed",
          duration: "01:22",
          createdAt: "2026-04-18T07:50:44.000Z",
        },
        {
          id: "CALL-JUNK",
          callerId: "",
          callerName: "",
          customerName: "",
          agentId: "",
          agentName: "",
          direction: "",
          createdAt: "",
        },
      ],
    });

    const payload = await api.getCallsList({ page: 1, limit: 30, direction: "incoming" });

    expect(payload.results).toHaveLength(1);
    expect(payload.results[0]?.id).toBe("CALL-2");
  });

  it("passes disposition filters through paginated call list requests", async () => {
    const fetchMock = mockJsonResponse({
      page: 1,
      limit: 30,
      total: 0,
      totalPages: 0,
      results: [],
    });

    await api.getCallsList({
      page: 1,
      limit: 30,
      direction: "incoming",
      disposition: "CTR",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/calls/list?page=1&limit=30&direction=incoming&disposition=CTR"),
      expect.anything(),
    );
  });

  it("loads nearby branches by coordinates for place-based branch assignment", async () => {
    const fetchMock = mockJsonResponse([
      {
        branchId: "BR-1",
        branchName: "Koramangala Branch",
        city: "Bengaluru",
        area: "Koramangala",
        distance: 2,
      },
    ]);

    const branches = await api.searchNearbyBranches({ lat: 12.9352, lng: 77.6245 });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/branches/search-nearby?lat=12.9352&lng=77.6245"),
      expect.anything(),
    );
    expect(branches[0]).toEqual(expect.objectContaining({
      id: "BR-1",
      name: "Koramangala Branch",
      distance: 2,
    }));
  });

  it("normalizes place suggestions for intake-form location search", async () => {
    mockJsonResponse([
      {
        description: "Koramangala, Bengaluru, Karnataka",
        lat: "12.9352",
        lng: "77.6245",
      },
    ]);

    const suggestions = await api.getPlaceSuggestions("Koram");

    expect(suggestions).toEqual([
      expect.objectContaining({
        description: "Koramangala, Bengaluru, Karnataka",
        lat: 12.9352,
        lng: 77.6245,
      }),
    ]);
  });

  it("loads customer dashboard rows from the saved intake-data endpoint", async () => {
    const fetchMock = mockJsonResponse({
      date: "2026-04-25",
      total: 1,
      results: [
        {
          customerName: "Rahila Customer",
          contact: "9876543210",
          type: "Release",
          branch: "BR001",
          date: "2026-04-25",
          time: "18:40",
          status: "Pending",
          dispositionCategory: "",
          grossW: "18",
          netW: "17.5",
          billId: "",
          walkinType: "Walk-In",
          firstAgentName: "Rahila fathima",
        },
      ],
    });

    const payload = await api.getCustomerDataDashboard("2026-04-25");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/customerdata/list?date=2026-04-25"),
      expect.anything(),
    );
    expect(payload).toEqual({
      date: "2026-04-25",
      total: 1,
      results: [
        {
          customerName: "Rahila Customer",
          contact: "9876543210",
          type: "Release",
          branch: "BR001",
          date: "2026-04-25",
          time: "18:40",
          status: "Pending",
          dispositionCategory: "",
          grossW: "18",
          netW: "17.5",
          billId: "",
          walkinType: "Walk-In",
          firstAgentName: "Rahila fathima",
        },
      ],
    });
  });

  it("passes strict mode through customerdata lookups when remote API-only rows are required", async () => {
    const fetchMock = mockJsonResponse([]);

    await api.getConversionData("9876543210", { strict: true });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/customerdata?contact=9876543210&strict=1"),
      expect.anything(),
    );
  });

  it("does not turn a failed billing response into a zero-record report", async () => {
    mockJsonResponse({error:"Unavailable"});
    await expect(api.getCustomerDataDashboard("2026-09-09")).rejects.toThrow("Customer data could not be loaded");
  });

  it("rejects a billing response for a different date", async () => {
    mockJsonResponse({date:"2026-09-08",total:0,results:[]});
    await expect(api.getCustomerDataDashboard("2026-09-09")).rejects.toThrow("different date");
  });

  it("preserves the billing sync timestamp and request cancellation signal", async () => {
    const signal=new AbortController().signal;
    const fetchMock=mockJsonResponse({date:"2026-09-09",total:0,results:[],lastSyncedAt:"2026-09-09T10:00:00Z"});
    const result=await api.getCustomerDataDashboard("2026-09-09",{signal});
    expect(result.lastSyncedAt).toBe("2026-09-09T10:00:00Z");
    expect(fetchMock).toHaveBeenCalledWith(expect.any(String),expect.objectContaining({signal}));
  });

  it("loads all paginated calls through the snapshot helper so screens share one full-day dataset", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          page: 1,
          limit: 2,
          total: 3,
          totalPages: 2,
          results: [
            {
              id: "CALL-1",
              callerId: "9876543210",
              agentId: "AG001",
              direction: "incoming",
              status: "completed",
              duration: "00:10",
            },
            {
              id: "CALL-2",
              callerId: "9876543211",
              agentId: "AG002",
              direction: "outgoing",
              status: "completed",
              duration: "00:12",
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          page: 2,
          limit: 2,
          total: 3,
          totalPages: 2,
          results: [
            {
              id: "CALL-3",
              callerId: "9876543212",
              agentId: "AG003",
              direction: "incoming",
              status: "completed",
              duration: "00:15",
            },
          ],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const payload = await api.getAllCallsSnapshot({ date: "2026-04-25", limit: 2 });

    expect(payload.ok).toBe(true);
    expect(payload.data.results.map((row) => row.id)).toEqual(["CALL-1", "CALL-2", "CALL-3"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("dedupes duplicate interactions even when a bad save created a different call id", async () => {
    mockJsonResponse({
      page: 1,
      limit: 30,
      total: 2,
      totalPages: 1,
      results: [
        {
          id: "CALL-NEWER",
          callerId: "7981847128",
          direction: "incoming",
          agentId: "AG007",
          status: "completed",
          duration: "00:01",
          ringStartedAt: "2026-04-18T07:19:43.000Z",
          answeredAt: "2026-04-18T07:19:46.000Z",
          endedAt: "2026-04-18T07:19:46.000Z",
          createdAt: "2026-04-18T07:25:40.000Z",
          intakeToken: "INTAKE-CALL-CALL-OLDER",
        },
        {
          id: "CALL-OLDER",
          callerId: "7981847128",
          direction: "incoming",
          agentId: "AG007",
          status: "completed",
          duration: "00:01",
          ringStartedAt: "2026-04-18T07:19:43.000Z",
          answeredAt: "2026-04-18T07:19:46.000Z",
          endedAt: "2026-04-18T07:19:46.000Z",
          createdAt: "2026-04-18T07:19:52.000Z",
          notes: "original row",
        },
      ],
    });

    const payload = await api.getCallsList({ page: 1, limit: 30, direction: "incoming" });

    expect(payload.results).toHaveLength(1);
    expect(payload.results[0]).toEqual(expect.objectContaining({
      id: "CALL-OLDER",
      notes: "original row",
      intakeToken: "INTAKE-CALL-CALL-OLDER",
    }));
  });

  it("recomputes date summary totals from the normalized deduped interaction set", async () => {
    mockJsonResponse({
      date: "2026-04-18",
      total: 2,
      inbound: 2,
      outbound: 0,
      results: [
        {
          id: "ROW-1",
          callerId: "9876543210",
          direction: "incoming",
          agentId: "AG001",
          status: "active",
          duration: "00:00",
          time: "10:15",
          date: "2026-04-18",
          ringStartedAt: "",
          answeredAt: "",
          endedAt: "",
          createdAt: "",
        },
        {
          id: "ROW-2",
          callerId: "9876543210",
          direction: "incoming",
          agentId: "AG001",
          status: "completed",
          duration: "00:21",
          talkDurationSeconds: 21,
          time: "10:15",
          date: "2026-04-18",
          ringStartedAt: "",
          answeredAt: "",
          endedAt: "",
          createdAt: "",
        },
      ],
    });

    const payload = await api.getCallsByDate("2026-04-18");

    expect(payload.total).toBe(1);
    expect(payload.inbound).toBe(1);
    expect(payload.outbound).toBe(0);
    expect(payload.results).toHaveLength(1);
    expect(payload.results[0]).toEqual(expect.objectContaining({
      id: "ROW-2",
      status: "completed",
      duration: "00:21",
    }));
  });

  it("surfaces date-summary fetch failures without replacing the caller state with a fake success", async () => {
    mockJsonResponse({ error: "Backend unavailable" }, { ok: false, status: 503 });

    const payload = await api.getCallsByDateSnapshot("2026-04-18");

    expect(payload.ok).toBe(false);
    expect(payload.status).toBe(503);
    expect(payload.data).toEqual({
      date: "2026-04-18",
      total: 0,
      inbound: 0,
      outbound: 0,
      results: [],
    });
  });

  it("surfaces malformed live-agent payloads as failed refreshes", async () => {
    mockJsonResponse({ agents: [] });

    const payload = await api.getLiveAgentsSnapshot();

    expect(payload.ok).toBe(false);
    expect(payload.data).toEqual([]);
  });

  it("surfaces auto follow-up queue fetch failures without erasing the queue as a fake success", async () => {
    mockJsonResponse({ error: "Queue unavailable" }, { ok: false, status: 503 });

    const payload = await api.getAutoDialLeadsSnapshot();

    expect(payload.ok).toBe(false);
    expect(payload.status).toBe(503);
    expect(payload.data).toEqual([]);
  });

  it("passes agent-scoped ready-queue filters through auto follow-up queue requests", async () => {
    const fetchMock = mockJsonResponse([]);

    await api.getAutoDialLeadsSnapshot({ agentId: "AG014", readyOnly: true, workMode: "follow-up" });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/auto-dial/leads?agentId=AG014&readyOnly=1&workMode=follow-up"),
      expect.anything(),
    );
  });

  it("normalizes incoming call queue rows from the missed-calls endpoint", async () => {
    mockJsonResponse([
      {
        id: 101,
        callerId: 9876543210,
        customerName: "",
        date: "2026-04-21",
        time: "10:15:00",
        language: 123,
        callbackStatus: "Pending",
      },
    ]);

    const [row] = await api.getIncomingCallQueue();

    expect(row).toEqual({
      id: "101",
      callerId: "9876543210",
      customerName: "N/A",
      date: "2026-04-21",
      time: "10:15:00",
      language: "123",
      callbackStatus: "Pending",
    });
  });

  it("normalizes live waiting queue snapshots from the asterisk endpoint", async () => {
    mockJsonResponse({
      generatedAt: "2026-04-21T14:45:00.000Z",
      totalWaiting: "2",
      queues: [
        {
          queueName: "attica-kannada",
          language: "Kannada",
          strategy: "rrmemory",
          waitingCalls: "2",
          completedCalls: "63",
          abandonedCalls: 28,
          holdTimeSeconds: "19",
          talkTimeSeconds: 173,
          serviceLevel: "0.0%",
          serviceLevel2: "0.0%",
          availableMembers: "2",
          unavailableMembers: 5,
          pausedMembers: "1",
          members: [
            {
              name: "PJSIP/2001",
              extension: 2001,
              status: "Not in use",
              paused: 0,
              pausedForSeconds: "0",
            },
          ],
          callers: [
            {
              position: "1",
              channel: "Local/9876543210@from-queue",
              customerNumber: 9876543210,
              waitTime: "00:22",
              waitTimeSeconds: "22",
              priority: 0,
            },
          ],
        },
      ],
    });

    const snapshot = await api.getLiveWaitingQueue();

    expect(snapshot).toEqual({
      generatedAt: "2026-04-21T14:45:00.000Z",
      totalWaiting: 2,
      queues: [
        {
          queueName: "attica-kannada",
          language: "Kannada",
          strategy: "rrmemory",
          waitingCalls: 2,
          completedCalls: 63,
          abandonedCalls: 28,
          holdTimeSeconds: 19,
          talkTimeSeconds: 173,
          serviceLevel: "0.0%",
          serviceLevel2: "0.0%",
          availableMembers: 2,
          unavailableMembers: 5,
          pausedMembers: 1,
          members: [
            {
              name: "PJSIP/2001",
              extension: "2001",
              status: "Not in use",
              paused: false,
              pausedForSeconds: 0,
            },
          ],
          callers: [
            {
              position: 1,
              channel: "Local/9876543210@from-queue",
              customerNumber: "9876543210",
              waitTime: "00:22",
              waitTimeSeconds: 22,
              priority: "0",
            },
          ],
        },
      ],
    });
  });

  it("normalizes customer profile fields to strings", async () => {
    mockJsonResponse({
      phone: 9876543210,
      customerName: 456,
      location: 12,
      branch: null,
      grams: 22.5,
      hasSavedDetails: "true",
      notes: null,
    });

    const profile = await api.getCustomerProfile("9876543210");

    expect(profile).toEqual(expect.objectContaining({
      phone: "9876543210",
      customerName: "456",
      location: "12",
      branch: "",
      grams: "22.5",
      hasSavedDetails: true,
      notes: "",
    }));
  });

  it("normalizes intake-form history rows from the dedicated intake store", async () => {
    mockJsonResponse({
      phone: 9876543210,
      total: 1,
      results: [
        {
          callId: "CALL-INTAKE-1",
          normalizedPhone: 9876543210,
          customerName: "Customer",
          agentId: "AG001",
          agentName: "Agent One",
          businessType: "Release",
          formStatus: "Planning to Visit",
          callbackStatus: "INT",
          lastSavedAt: "2026-04-20T09:35:00.000Z",
        },
      ],
    });

    const payload = await api.getIntakeFormHistory("9876543210");

    expect(payload).toEqual(expect.objectContaining({
      phone: "9876543210",
      total: 1,
    }));
    expect(payload.results[0]).toEqual(expect.objectContaining({
      id: "CALL-INTAKE-1",
      callerId: "9876543210",
      customerName: "Customer",
      agentId: "AG001",
      formStatus: "Planning to Visit",
      callbackStatus: "INT",
      createdAt: "2026-04-20T09:35:00.000Z",
    }));
  });

  it("posts intake draft saves to the dedicated intake endpoint", async () => {
    const fetchMock = mockJsonResponse({ success: true });

    const result = await api.saveIntakeFormWithResult({
      id: "CALL-1",
      callerId: "9876543210",
      customerName: "Customer",
    });

    expect(result).toEqual({ success: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/intake-forms",
      expect.objectContaining({
        cache: "no-store",
        method: "POST",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
      }),
    );
  });

  it("sends IVR selection updates with only the chosen non-empty fields", async () => {
    const fetchMock = mockJsonResponse({ ok: true, success: true });

    const result = await api.saveCallIvrSelection({
      phone: "+91 98765 43210",
      language: "Kannada",
      businessType: "",
      purpose: "Gold Loan",
      agentId: "AG001",
      agentName: "Agent One",
      source: "transfer",
    });

    expect(result).toEqual(expect.objectContaining({ ok: true, success: true }));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/save-call-ivr?phone=9876543210&language=Kannada&purpose=Gold+Loan&agentId=AG001&agentName=Agent+One&source=transfer",
      expect.objectContaining({
        cache: "no-store",
      }),
    );
  });

  it("preserves backend error details for failed mutation responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: vi.fn().mockResolvedValue({
        success: false,
        error: "Another live call is already active for this agent.",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await api.claimAgentCallSlot("AG001", {
      callId: "CALL-1",
      direction: "incoming",
      fallbackAgentStatus: "active",
    });

    expect(result).toEqual(expect.objectContaining({
      success: false,
      error: "Another live call is already active for this agent.",
    }));
  });

  it("replaces placeholder mutation errors with a request-specific fallback when the server is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network down")));

    const result = await api.claimAgentCallSlot("AG001", {
      callId: "CALL-1",
      direction: "incoming",
      fallbackAgentStatus: "active",
    });

    expect(result).toEqual(expect.objectContaining({
      success: false,
      error: "Unable to reserve the live call slot because the server could not be reached. Refresh and try again.",
    }));
  });

  it("retries retryable live call slot reservation failures before surfacing an error", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: vi.fn().mockResolvedValue({ success: false, error: "Error" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ success: true }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const resultPromise = api.claimAgentCallSlot("AG001", {
      callId: "CALL-1",
      direction: "incoming",
      fallbackAgentStatus: "active",
    });

    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual(expect.objectContaining({ success: true }));
    vi.useRealTimers();
  });

  it("passes force-hangup teardown flags through release and reset call-state mutations", async () => {
    const fetchMock = mockJsonResponse({ success: true });

    await api.releaseAgentCallSlot("AG008", {
      callId: "CALL-2008",
      nextStatus: "active",
      forceHangup: true,
      keepalive: true,
    });
    await api.resetAgentCallState("AG008", {
      nextStatus: "active",
      finalCallStatus: "failed",
      reason: "Browser page exit cleanup",
      forceHangup: true,
      keepalive: true,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/agents/AG008/call-slot/release",
      expect.objectContaining({
        method: "POST",
        keepalive: true,
        body: JSON.stringify({
          callId: "CALL-2008",
          nextStatus: "active",
          force: undefined,
          forceHangup: true,
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/agents/AG008/call-state/reset",
      expect.objectContaining({
        method: "POST",
        keepalive: true,
        body: JSON.stringify({
          nextStatus: "active",
          finalCallStatus: "failed",
          reason: "Browser page exit cleanup",
          forceHangup: true,
        }),
      }),
    );
  });

  it("normalizes auto-dial queue-exit metadata for agent alerts", async () => {
    mockJsonResponse({
      id: "AUTO-1",
      mobileNumber: 9876543210,
      customerName: "Duplicate Lead",
      status: "failed",
      queueExitReason: "Wrong Number",
      retryAllowed: 0,
    });

    const lead = await api.getCurrentAutoDialLead("AG001");

    expect(lead).toEqual(expect.objectContaining({
      mobileNumber: "9876543210",
      status: "failed",
      queueExitReason: "Wrong Number",
      retryAllowed: false,
    }));
  });

  it("normalizes follow-up payloads used by dashboard reminders", async () => {
    mockJsonResponse([
      {
        id: null,
        customerName: 1234,
        phone: 9998887776,
        followUpAt: 20260418,
        status: "unknown",
        notes: 55,
        sourceStatus: 7,
      },
    ]);

    const [followUp] = await api.getFollowUps();

    expect(followUp).toEqual(expect.objectContaining({
      id: "9998887776|20260418",
      customerName: "1234",
      phone: "9998887776",
      followUpAt: "20260418",
      status: "Pending",
      notes: "55",
      sourceStatus: "7",
    }));
  });

  it("normalizes malformed branch payloads before rendering branch filters", async () => {
    mockJsonResponse([
      {
        id: 101,
        name: 202,
        city: { label: "Bengaluru" },
        address: 404,
        area: null,
        state: true,
        pincode: 560001,
        timings: ["9:30 AM - 6:00 PM"],
      },
    ]);

    const [branch] = await api.getBranches();

    expect(branch).toEqual(expect.objectContaining({
      id: "101",
      name: "202",
      city: "",
      address: "404",
      area: "",
      state: "",
      pincode: "560001",
      timings: "",
      url: "",
    }));
  });

  it("preserves and coerces sip login fields", async () => {
    mockJsonResponse({
      id: "AG001",
      name: "Agent One",
      role: "agent",
      extension: 2001,
      sipPassword: 6789,
    });

    const user = await api.login("AG001", "secret");

    expect(user).toEqual(expect.objectContaining({
      id: "AG001",
      name: "Agent One",
      role: "agent",
      extension: "2001",
    }));
    expect((user as (AuthUserRecord & { sipPassword?: string }) | null)?.sipPassword).toBe("6789");
  });

  it("surfaces invalid-credential login failures separately from backend outages", async () => {
    mockJsonResponse({ error: "Invalid credentials" }, { ok: false, status: 401 });

    await expect(api.login("AG001", "wrong-password")).rejects.toMatchObject({
      message: "Invalid credentials",
      status: 401,
      network: false,
    });
  });

  it("maps backend login outages to a clean unavailable message", async () => {
    mockJsonResponse({ error: "connect ECONNREFUSED 127.0.0.1:3306" }, { ok: false, status: 503 });

    await expect(api.login("AG001", "secret")).rejects.toMatchObject({
      message: "Backend login unavailable",
      status: 503,
      network: false,
    });
  });

  it("normalizes explicit backend base URLs like a dialer server connection", () => {
    expect(normalizeApiBaseUrl("https://dialer.example.com")).toBe("https://dialer.example.com/api");
    expect(normalizeApiBaseUrl("https://dialer.example.com/api/")).toBe("https://dialer.example.com/api");
    expect(buildApiUrl("/calls", "https://dialer.example.com")).toBe("https://dialer.example.com/api/calls");
  });

  it("resolves backend-relative recording URLs against the configured API host", () => {
    expect(resolveBackendUrl("/api/recordings/test.wav", {
      apiBaseUrl: "https://dialer.example.com",
      currentOrigin: "https://frontend.example.com",
    })).toBe("https://dialer.example.com/api/recordings/test.wav");

    expect(resolveBackendUrl("/recordings/test.wav", {
      apiBaseUrl: "https://dialer.example.com/api",
      currentOrigin: "https://frontend.example.com",
    })).toBe("https://dialer.example.com/recordings/test.wav");
  });

  it("marks frontend call saves as client-managed slot updates to avoid redundant slot locking", async () => {
    const fetchMock = mockJsonResponse({ success: true });

    await api.saveCallWithResult({
      id: "CALL-1",
      agentId: "AG001",
      status: "completed",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] ?? [];
    const payload = JSON.parse(String(init?.body || "{}"));
    expect(payload).toEqual(expect.objectContaining({
      id: "CALL-1",
      agentId: "AG001",
      status: "completed",
      skipCallSlotSync: true,
      clientSlotManaged: true,
    }));
  });
});
