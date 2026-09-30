import { useCallback, useEffect, useRef, useState } from "react";
import { api, type CustomerDataDashboardResult } from "@/lib/api";

const emptyData = (date: string): CustomerDataDashboardResult => ({date,total:0,results:[]});

export function useCustomerDataDashboard(date: string, enabled: boolean) {
  const [data,setData] = useState(() => emptyData(date));
  const [loading,setLoading] = useState(false);
  const [error,setError] = useState("");
  const request = useRef<AbortController | null>(null);

  const refresh = useCallback(async (options: {force?: boolean} = {}) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError("");
    setData(current => current.date === date ? current : emptyData(date));
    try {
      const result = await api.getCustomerDataDashboard(date || undefined, {
        force: options.force ?? false, signal: controller.signal,
      });
      if (!controller.signal.aborted) setData(result);
    } catch {
      if (!controller.signal.aborted) setError("Customer data could not be refreshed. Please retry.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  },[date]);

  useEffect(() => {
    if (enabled) void refresh({force:true});
    return () => { request.current?.abort(); };
  },[enabled,refresh]);

  return {data,loading,error,refresh};
}
