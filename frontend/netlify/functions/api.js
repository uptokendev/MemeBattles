module.exports.handler = async function handler(event, context) {
  const mod = await import("./api.mjs");
  return mod.handler(event, context);
};
