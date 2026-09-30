function errorResponse(res, error, fallback = {}) {
  return res.status(Number(error?.status) || 500).json({ error: error?.message || 'SEO/Marketing request failed', ...fallback });
}

export function createSeoMarketingController(service, getRole) {
  const request = (req) => ({ role: getRole(req), query: req.query || {} });
  return {
    async dashboard(req, res) {
      try { return res.json(await service.getDashboard(request(req))); }
      catch (error) { return errorResponse(res, error, { rows: [] }); }
    },
    async leadToBillSummary(req, res) {
      try { return res.json(await service.getLeadToBillSummary(request(req))); }
      catch (error) { return errorResponse(res, error); }
    },
    async leadToBillDetails(req, res) {
      try { return res.json(await service.getLeadToBillDetails(request(req))); }
      catch (error) { return errorResponse(res, error, { rows: [] }); }
    },
    async googleStatus(req, res) {
      try { return res.json(await service.getGoogleStatus(request(req))); }
      catch (error) { return errorResponse(res, error); }
    },
    async spend(req, res) {
      try { return res.json(await service.getSpend(request(req))); }
      catch (error) { return errorResponse(res, error, { rows: [] }); }
    },
    async exportSpend(req, res) {
      try {
        const result = await service.exportSpend(request(req));
        res.set(result.headers || {});
        return res.send(result.body);
      } catch (error) { return res.status(Number(error?.status) || 500).type('text/plain').send(error?.message || 'SEO/Marketing export failed'); }
    },
    async exportLeads(req, res) {
      try {
        const result = await service.exportLeads(request(req));
        res.set(result.headers || {});
        return res.send(result.body);
      } catch (error) { return res.status(Number(error?.status) || 500).type('text/plain').send(error?.message || 'SEO/Marketing export failed'); }
    },
  };
}
