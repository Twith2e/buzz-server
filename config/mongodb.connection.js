import mongoose from "mongoose";
import dns from "dns";

export default async function (url) {
  const connect = async () =>
    mongoose.connect(url, {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
    });

  try {
    try {
      const connection = await connect();
      if (connection) console.log("Database connection is live");
      return connection;
    } catch (err) {
      const isSrvDnsError =
        (err && err.code === "ESERVFAIL") ||
        (err && typeof err.message === "string" && err.message.includes("ESERVFAIL"));

      if (isSrvDnsError) {
        console.warn(
          "SRV/TXT DNS resolution failed (ESERVFAIL). Attempting DNS fallback to 8.8.8.8 and 1.1.1.1 and retrying...",
        );
        try {
          dns.setServers(["8.8.8.8", "1.1.1.1"]);
        } catch (e) {
          console.warn("dns.setServers failed:", e);
        }
        const connection = await connect();
        if (connection) console.log("Database connection is live (after DNS fallback)");
        return connection;
      }

      throw err;
    }
  } catch (error) {
    console.log(error && error.message ? error.message : error);
    throw error;
  }
}
