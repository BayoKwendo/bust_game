module.exports = {
  PORT: process.env.PORT || 3846,
  USE_HTTPS: process.env.USE_HTTPS,
  HTTPS_KEY: process.env.HTTPS_KEY || "./key.pem",
  HTTPS_CERT: process.env.HTTPS_CERT || "./cert.pem",
  HTTPS_CA: process.env.HTTPS_CA,
  // DATABASE_URL: "postgres://bust_ng:xA_2cMVZSRsdfufEGg@localhost/bustngdb",

  DATABASE_URL: "postgres://supabasta:xAs9cMVZSRPWGCNufEGg@localhost/supabastadb",
  ENC_KEY: process.env.ENC_KEY || "devkey",
  SMS_URL: "http://0.0.0.0:1410/autoresponse",
  HOTLINE: "0703012900",
  THRESHHOLD: 0.7,
  PRODUCTION: process.env.NODE_ENV === "production",
  VIG: 0.1,
  //Do not set any of this on production
  CRASH_AT: process.env.CRASH_AT, //Force the crash point
  //SMS
  SMS_CONGRATS: `CONGRATULATION! You won!\n\nBet Amount: %s\nBustout Point: %s\n-\nGame Bustout point: %s\n-\nYour WINNING: %s.\n-\nWallet Balance : %s\n-\nPLAY AGAIN NOW to WIN more cash.\n\nSms BAmount*Bustout Point to 29304,\nEg\nB50*1.25\n\nLast BustPoints:\n1. %s\n2. %s\n3. %s\n4. %s\n5. %s\n\n  HelpDesk: 0110095465`,
  SMS_LOST: `Oh no! You lost!\n\nBet Amount: %s\nBustout Point: %s\n-\nGame Bust point: %s\n-\nWallet Balance : %s\n-\nPLAY AGAIN NOW to WIN\n\nSms BAmount*BUSTOUT to 29304,\nEg\nK50*1.25\n\nLast BustPoints:\n1. %s\n2. %s\n3. %s\n4. %s\n5. %s\n\n  HelpDesk: 0110095465`,
                            
};
