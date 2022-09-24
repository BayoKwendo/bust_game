module.exports = {
  PORT: process.env.PORT || 3846,
  USE_HTTPS: process.env.USE_HTTPS,
  HTTPS_KEY: process.env.HTTPS_KEY || "./key.pem",
  HTTPS_CERT: process.env.HTTPS_CERT || "./cert.pem",
  HTTPS_CA: process.env.HTTPS_CA,
  DATABASE_URL: "postgres://supabasta:xAs9cMddjjv#@CNu_fEGg@127.0.0.1/supabastadb",
  ENC_KEY: process.env.ENC_KEY || "devkey",
  SMS_URL: "http://0.0.0.0:1410/autoresponse",
  HOTLINE: "0703012900",
  THRESHHOLD: 0.7,
  PRODUCTION: process.env.NODE_ENV === "production",
  VIG: 0.1,
  //Do not set any of this on production
  CRASH_AT: process.env.CRASH_AT, //Force the crash point
};
