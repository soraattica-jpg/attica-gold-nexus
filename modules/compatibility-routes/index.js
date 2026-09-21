// Transitional registration boundary. Business handlers remain byte-preserved
// in the generated candidate until their feature module is extracted.
export function mountCompatibilityRoute(app,method,...args){if(!['get','post','put','patch','delete','options','head','all'].includes(method)||typeof app?.[method]!=='function')throw new Error(`Unsupported route method: ${method}`);return app[method](...args);}
