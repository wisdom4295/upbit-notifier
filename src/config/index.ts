interface Config {
  server: {
    port: number;
    nodeEnv: string;
  };
  upbit: {
    minVolume: number;
    coins: string[];
  };
  kakao: {
    token: string;
  };
  redis: {
    url: string;
  };
}

export const config: Config = {
  server: {
    port: parseInt(process.env.PORT || "3000"),
    nodeEnv: process.env.NODE_ENV || "development",
  },
  upbit: {
    minVolume: parseInt(process.env.MIN_VOLUME_KRW || "40000"),
    coins: (process.env.COINS || "BTC,ETH").split(",").map((c) => c.trim()),
  },
  kakao: {
    token: process.env.KAKAO_TOKEN || "",
  },
  redis: {
    url: process.env.REDIS_URL || "redis://localhost:6379",
  },
};

console.log("🚀 Config loaded:", {
  coins: config.upbit.coins,
  minVolume: config.upbit.minVolume,
});
