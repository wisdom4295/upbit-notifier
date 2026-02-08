export const config = {
  server: {
    port: process.env.PORT || 3000,
    nodeEnv: process.env.NODE_ENV || "development",
  },
  upbit: {
    minVolume: parseInt(process.env.MIN_VOLUME_KRW || "40000"),
    coins: (process.env.COINS || "BTC,ETH").split(","),
  },
  kakao: {
    token: process.env.KAKAO_TOKEN || "",
  },
  redis: {
    url: process.env.REDIS_URL || "redis://localhost:6379",
  },
};
