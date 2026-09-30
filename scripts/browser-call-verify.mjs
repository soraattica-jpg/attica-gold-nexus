#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";

const DEFAULT_APP_URL = "http://127.0.0.1";
const DEFAULT_API_URL = "http://127.0.0.1:3001";
const DEFAULT_AGENT_ID = "AG001";
const DEFAULT_AGENT_PASSWORD = (process.env.ATTICA_VERIFY_AGENT_PASSWORD || "");
const DEFAULT_CONNECT_TIMEOUT_MS = 90000;
const DEFAULT_AUDIO_PROBE_MS = 4000;
const DEFAULT_POST_CONNECT_SETTLE_MS = 2500;
const DEFAULT_VIEWPORT = { width: 1440, height: 1100 };

function fail(message) {
  console.error(message);
  process.exit(1);
}

function parseArgs(argv) {
  const options = {
    appUrl: DEFAULT_APP_URL,
    apiUrl: DEFAULT_API_URL,
    agentId: DEFAULT_AGENT_ID,
    agentPassword: DEFAULT_AGENT_PASSWORD,
    connectTimeoutMs: DEFAULT_CONNECT_TIMEOUT_MS,
    audioProbeMs: DEFAULT_AUDIO_PROBE_MS,
    postConnectSettleMs: DEFAULT_POST_CONNECT_SETTLE_MS,
    expectRemoteAudio: true,
    target: "",
    recordingPath: "",
    hangupDelayMs: 1500,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--app-url" && next) {
      options.appUrl = next;
      index += 1;
      continue;
    }
    if (arg === "--api-url" && next) {
      options.apiUrl = next;
      index += 1;
      continue;
    }
    if (arg === "--agent" && next) {
      options.agentId = next;
      index += 1;
      continue;
    }
    if (arg === "--password" && next) {
      options.agentPassword = next;
      index += 1;
      continue;
    }
    if (arg === "--target" && next) {
      options.target = next;
      index += 1;
      continue;
    }
    if (arg === "--connect-timeout-ms" && next) {
      options.connectTimeoutMs = Number(next) || DEFAULT_CONNECT_TIMEOUT_MS;
      index += 1;
      continue;
    }
    if (arg === "--audio-probe-ms" && next) {
      options.audioProbeMs = Number(next) || DEFAULT_AUDIO_PROBE_MS;
      index += 1;
      continue;
    }
    if (arg === "--post-connect-settle-ms" && next) {
      options.postConnectSettleMs = Number(next) || DEFAULT_POST_CONNECT_SETTLE_MS;
      index += 1;
      continue;
    }
    if (arg === "--recording-path" && next) {
      options.recordingPath = next;
      index += 1;
      continue;
    }
    if (arg === "--hangup-delay-ms" && next) {
      options.hangupDelayMs = Number(next) || 1500;
      index += 1;
      continue;
    }
    if (arg === "--skip-remote-audio-check") {
      options.expectRemoteAudio = false;
      continue;
    }
    if (!arg.startsWith("--") && !options.target) {
      options.target = arg;
      continue;
    }
  }

  if (!options.target) {
    fail("Usage: node scripts/browser-call-verify.mjs --target <number-or-extension> [--recording-path <wav>]");
  }

  return options;
}

async function readJson(baseUrl, route, init = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    ...init,
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${typeof parsed === "string" ? parsed : JSON.stringify(parsed)}`);
  }
  return parsed;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jsonLog(step, payload = {}) {
  console.log(JSON.stringify({
    step,
    at: new Date().toISOString(),
    ...payload,
  }, null, 2));
}

function getDialerPanel(page) {
  return page.locator(".surface-panel").filter({
    has: page.getByRole("heading", { name: "Dialer", exact: true }),
  }).first();
}

function ensureToneFile() {
  const tonePath = path.join(os.tmpdir(), "attica-browser-call-verify-tone.wav");
  if (!fs.existsSync(tonePath)) {
    execFileSync("sox", [
      "-n",
      "-r",
      "48000",
      "-c",
      "1",
      tonePath,
      "synth",
      "30",
      "sine",
      "1000",
      "vol",
      "0.35",
    ], { stdio: "ignore" });
  }
  return tonePath;
}

function getSuccessScreenshotPath(target) {
  return path.join(os.tmpdir(), `attica-browser-call-verify-${String(target).replace(/[^a-zA-Z0-9_*#+-]+/g, "_")}.png`);
}

function getFailureScreenshotPath(target) {
  return path.join(os.tmpdir(), `attica-browser-call-verify-${String(target).replace(/[^a-zA-Z0-9_*#+-]+/g, "_")}-failure.png`);
}

async function buildInjectedUser(apiUrl, agentId, agentPassword) {
  const loginUser = await readJson(apiUrl, "/api/login", {
    method: "POST",
    body: JSON.stringify({ id: agentId, password: agentPassword }),
  });
  return {
    ...loginUser,
    status: "active",
    sipPassword: agentPassword,
  };
}

async function ensureAgentActive(apiUrl, agentId, fallbackName = "Test Agent") {
  const agentRows = await readJson(apiUrl, "/api/agents");
  const current = Array.isArray(agentRows)
    ? agentRows.find((row) => String(row?.id || "").trim().toUpperCase() === String(agentId || "").trim().toUpperCase()) || null
    : null;
  const initialStatus = String(current?.status || "").trim().toLowerCase() || "active";
  if (initialStatus !== "active") {
    await readJson(apiUrl, `/api/agents/${encodeURIComponent(String(agentId || "").trim().toUpperCase())}`, {
      method: "PUT",
      body: JSON.stringify({
        status: "active",
        agentName: String(current?.name || fallbackName || "Test Agent"),
      }),
    });
  }
  return {
    initialStatus,
    initialName: String(current?.name || fallbackName || "Test Agent"),
  };
}

async function restoreAgentStatus(apiUrl, agentId, initialStatus, initialName) {
  if (!initialStatus || initialStatus === "active") return;
  await readJson(apiUrl, `/api/agents/${encodeURIComponent(String(agentId || "").trim().toUpperCase())}`, {
    method: "PUT",
    body: JSON.stringify({
      status: initialStatus,
      agentName: String(initialName || "Test Agent"),
    }),
  });
}

async function waitForSipOnline(page) {
  await page.getByText("SIP Online", { exact: true }).waitFor({ timeout: 60000 });
}

async function setActiveStatus(page) {
  const activeButton = getDialerPanel(page).getByRole("button", { name: "Active", exact: true }).first();
  await activeButton.waitFor({ timeout: 15000 });
  await activeButton.click().catch(() => {});
  await sleep(1500);
}

async function enterTarget(page, target) {
  const input = getDialerPanel(page).getByPlaceholder("Type or tap digits");
  await input.waitFor({ timeout: 30000 });
  await input.fill("");
  await input.click();
  await page.keyboard.type(String(target), { delay: 80 });
}

async function waitForConnected(page, timeoutMs) {
  await page.getByText("Connected", { exact: true }).waitFor({ timeout: timeoutMs });
}

async function isLocatorVisible(locator) {
  try {
    return await locator.isVisible();
  } catch {
    return false;
  }
}

async function waitForCallActive(page, apiUrl, agentId, timeoutMs) {
  const startedAt = Date.now();
  let lastAgentSnapshot = null;

  while (Date.now() - startedAt < timeoutMs) {
    const connectedLabelVisible = await isLocatorVisible(page.getByText("Connected", { exact: true }));
    if (connectedLabelVisible) {
      return {
        source: "ui-connected-label",
        agentSnapshot: lastAgentSnapshot,
      };
    }

    const activeToastVisible = await isLocatorVisible(page.getByText("Fill customer details while the call is active.", { exact: true }));
    const liveControlsVisible = await isLocatorVisible(page.getByText("Live Call Controls", { exact: true }));
    if (activeToastVisible || liveControlsVisible) {
      return {
        source: activeToastVisible ? "ui-active-toast" : "ui-live-controls",
        agentSnapshot: lastAgentSnapshot,
      };
    }

    try {
      const liveAgents = await readJson(apiUrl, "/api/live-agents?fresh=1");
      const agentRow = Array.isArray(liveAgents)
        ? liveAgents.find((row) => String(row?.agentId || "").trim().toUpperCase() === String(agentId || "").trim().toUpperCase()) || null
        : null;
      if (agentRow) {
        lastAgentSnapshot = {
          status: String(agentRow.status || ""),
          sipStatus: String(agentRow.sipStatus || ""),
          activeCalls: Number(agentRow.activeCalls || 0),
        };
        if (lastAgentSnapshot.activeCalls > 0 || lastAgentSnapshot.status === "on-call") {
          return {
            source: "api-active-call",
            agentSnapshot: lastAgentSnapshot,
          };
        }
      }
    } catch {
      // Keep polling on transient API failures during verification.
    }

    await sleep(1000);
  }

  throw new Error("Timed out waiting for the browser call to become active");
}

async function waitForDialStart(page) {
  await getDialerPanel(page).getByRole("button", { name: "End Call", exact: true }).waitFor({ timeout: 15000 });
}

async function waitForIdle(page) {
  await getDialerPanel(page).getByRole("button", { name: "Call", exact: true }).waitFor({ timeout: 30000 });
}

async function waitForAgentIdle(apiUrl, agentId, timeoutMs = 30000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const liveAgents = await readJson(apiUrl, "/api/live-agents?fresh=1");
      const agentRow = Array.isArray(liveAgents)
        ? liveAgents.find((row) => String(row?.agentId || "").trim().toUpperCase() === String(agentId || "").trim().toUpperCase()) || null
        : null;
      if (agentRow) {
        const activeCalls = Number(agentRow.activeCalls || 0);
        const status = String(agentRow.status || "").trim().toLowerCase();
        if (activeCalls === 0 && status !== "on-call") {
          return {
            status,
            sipStatus: String(agentRow.sipStatus || ""),
            activeCalls,
          };
        }
      }
    } catch {
      // Ignore transient API failures during hangup validation.
    }
    await sleep(1000);
  }
  throw new Error("Timed out waiting for the agent call to clear after hangup");
}

async function analyzeRemoteAudio(page, probeMs) {
  await page.waitForFunction(() => {
    const remoteAudio = document.getElementById("remoteAudio");
    return remoteAudio instanceof HTMLAudioElement;
  }, { timeout: 20000 });

  return await page.evaluate(async (durationMs) => {
    const remoteAudio = document.getElementById("remoteAudio");
    if (!(remoteAudio instanceof HTMLAudioElement)) {
      return { ok: false, reason: "remote-audio-element-missing" };
    }
    const remoteStream = remoteAudio.srcObject;
    if (!(remoteStream instanceof MediaStream)) {
      return { ok: false, reason: "remote-audio-stream-missing" };
    }
    if (remoteStream.getAudioTracks().length === 0) {
      return { ok: false, reason: "remote-audio-track-missing" };
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      return { ok: false, reason: "audio-context-unavailable" };
    }

    const context = new AudioContextClass();
    const analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.1;
    const source = context.createMediaStreamSource(remoteStream);
    source.connect(analyser);

    const data = new Float32Array(analyser.fftSize);
    let maxPeak = 0;
    let maxRms = 0;
    let audibleSamples = 0;
    const sampleCount = Math.max(1, Math.ceil(durationMs / 120));
    for (let index = 0; index < sampleCount; index += 1) {
      analyser.getFloatTimeDomainData(data);
      let peak = 0;
      let sumSquares = 0;
      for (let dataIndex = 0; dataIndex < data.length; dataIndex += 1) {
        const sample = data[dataIndex];
        const absolute = Math.abs(sample);
        if (absolute > peak) peak = absolute;
        sumSquares += sample * sample;
      }
      const rms = Math.sqrt(sumSquares / data.length);
      maxPeak = Math.max(maxPeak, peak);
      maxRms = Math.max(maxRms, rms);
      if (peak > 0.01 || rms > 0.0025) audibleSamples += 1;
      await new Promise((resolve) => window.setTimeout(resolve, 120));
    }

    source.disconnect();
    analyser.disconnect();
    await context.close().catch(() => {});

    return {
      ok: true,
      maxPeak: Number(maxPeak.toFixed(5)),
      maxRms: Number(maxRms.toFixed(5)),
      audibleSamples,
      detectedRemoteAudio: audibleSamples >= 3,
      remoteAudioPaused: remoteAudio.paused,
      remoteAudioMuted: remoteAudio.muted,
      remoteAudioVolume: remoteAudio.volume,
      remoteTracks: remoteStream.getAudioTracks().map((track) => ({
        id: track.id,
        kind: track.kind,
        muted: track.muted,
        enabled: track.enabled,
        readyState: track.readyState,
      })),
    };
  }, probeMs);
}

function analyzeRecording(recordingPath) {
  if (!recordingPath || !fs.existsSync(recordingPath)) {
    return {
      exists: false,
      path: recordingPath || "",
    };
  }

  const fileInfo = execFileSync("sox", ["--i", recordingPath], { encoding: "utf8" }).trim();
  let statsText = "";
  try {
    statsText = execFileSync("sox", [recordingPath, "-n", "stat"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    statsText = String(error?.stderr || error?.stdout || error?.message || "");
  }

  const maxAmplitudeMatch = statsText.match(/Maximum amplitude:\s+([0-9.]+)/i);
  const rmsAmplitudeMatch = statsText.match(/RMS\s+amplitude:\s+([0-9.]+)/i);
  const durationMatch = fileInfo.match(/Duration\s+:\s+([0-9:.\s=]+)/i);

  return {
    exists: true,
    path: recordingPath,
    fileInfo,
    maxAmplitude: maxAmplitudeMatch ? Number(maxAmplitudeMatch[1]) : null,
    rmsAmplitude: rmsAmplitudeMatch ? Number(rmsAmplitudeMatch[1]) : null,
    duration: durationMatch ? durationMatch[1].trim() : null,
    detectedAudio: Boolean(
      (maxAmplitudeMatch && Number(maxAmplitudeMatch[1]) > 0.01)
      || (rmsAmplitudeMatch && Number(rmsAmplitudeMatch[1]) > 0.001)
    ),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const successScreenshotPath = getSuccessScreenshotPath(options.target);
  const failureScreenshotPath = getFailureScreenshotPath(options.target);
  const fakeTonePath = ensureToneFile();

  const injectedUser = await buildInjectedUser(options.apiUrl, options.agentId, options.agentPassword);
  const agentStatusState = await ensureAgentActive(options.apiUrl, options.agentId, injectedUser.name || "Test Agent");

  const summary = {
    ok: false,
    target: options.target,
    appUrl: options.appUrl,
    apiUrl: options.apiUrl,
    agentId: options.agentId,
    fakeTonePath,
    screenshot: "",
    remoteAudio: null,
    recording: null,
  };

  const browser = await chromium.launch({
    headless: true,
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      `--use-file-for-fake-audio-capture=${fakeTonePath}`,
      "--autoplay-policy=no-user-gesture-required",
      "--ignore-certificate-errors",
      "--allow-running-insecure-content",
      "--no-sandbox",
    ],
  });

  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    permissions: ["microphone"],
    viewport: DEFAULT_VIEWPORT,
  });

  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") {
      console.log(`[browser:error] ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => {
    console.log(`[browser:pageerror] ${error.message}`);
  });

  try {
    await page.addInitScript((user) => {
      window.sessionStorage.setItem("attica_user", JSON.stringify(user));
    }, injectedUser);

    await page.goto(options.appUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.getByRole("heading", { name: "Dialer", exact: true }).waitFor({ timeout: 30000 });
    await waitForSipOnline(page);
    await setActiveStatus(page);
    jsonLog("sip-ready", { agentId: options.agentId, target: options.target });

    await enterTarget(page, options.target);
    await getDialerPanel(page).getByRole("button", { name: "Call", exact: true }).click();
    await waitForDialStart(page);
    jsonLog("dial-started", { target: options.target });

    const activeSignal = await waitForCallActive(page, options.apiUrl, options.agentId, options.connectTimeoutMs);
    jsonLog("call-connected", { target: options.target, ...activeSignal });

    if (options.expectRemoteAudio) {
      await sleep(options.postConnectSettleMs);
      summary.remoteAudio = await analyzeRemoteAudio(page, options.audioProbeMs);
      jsonLog("remote-audio-probe", summary.remoteAudio || {});
    }

    await sleep(options.hangupDelayMs);
    await getDialerPanel(page).getByRole("button", { name: "End Call", exact: true }).click({ force: true });
    const idleSignal = await waitForAgentIdle(options.apiUrl, options.agentId);
    jsonLog("call-cleared", idleSignal);

    await page.screenshot({ path: successScreenshotPath, fullPage: true });
    summary.screenshot = successScreenshotPath;
    summary.recording = options.recordingPath ? analyzeRecording(options.recordingPath) : null;
    summary.ok = true;
    console.log(JSON.stringify(summary, null, 2));
  } catch (error) {
    try {
      await page.screenshot({ path: failureScreenshotPath, fullPage: true });
      summary.screenshot = failureScreenshotPath;
    } catch {
      // Ignore screenshot failures.
    }
    summary.error = String(error?.message || error);
    summary.recording = options.recordingPath ? analyzeRecording(options.recordingPath) : null;
    console.error(JSON.stringify(summary, null, 2));
    process.exitCode = 1;
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
    await restoreAgentStatus(options.apiUrl, options.agentId, agentStatusState.initialStatus, agentStatusState.initialName).catch(() => {});
  }
}

main().catch((error) => {
  console.error(String(error?.message || error));
  process.exit(1);
});
