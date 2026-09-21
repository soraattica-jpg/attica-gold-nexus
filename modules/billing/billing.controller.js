export function createBillingController(service, logger = console) {
  return {
    list: async (req, res) => {
      try {
        res.json(await service.list(req.query));
      } catch (error) {
        logger.error?.('[customerdata/list] remote customer data failed:', error?.message || error);
        res.status(500).json({ error: 'Customer data is temporarily unavailable. Please retry.' });
      }
    },
    lookup: async (req, res) => {
      try {
        res.json(await service.lookup(req.query));
      } catch (_error) {
        res.status(500).json([]);
      }
    },
  };
}
