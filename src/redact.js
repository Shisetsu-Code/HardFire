'use strict';

const SENSITIVE = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'proxy-authorization',
  'x-api-key',
  'api-key'
]);

function redactHeaderArray(headers = []) {
  return (headers || []).map(({ name, value }) => ({
    name,
    value: SENSITIVE.has(String(name).toLowerCase())
      ? '[REDACTED]'
      : value
  }));
}

function headersArrayToObject(headers = []) {
  const out = {};
  for (const { name, value } of redactHeaderArray(headers)) {
    if (Object.prototype.hasOwnProperty.call(out, name)) {
      out[name] = Array.isArray(out[name])
        ? [...out[name], value]
        : [out[name], value];
    } else {
      out[name] = value;
    }
  }
  return out;
}

module.exports = { redactHeaderArray, headersArrayToObject };
