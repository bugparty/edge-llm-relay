# Relay Usage Extractor Example

下面这份脚本不再直接请求 provider 原生控制台接口，而是请求本项目统一返回的
`/v1/usage` 接口。

它兼容当前 relay 的 normalized usage 结构，适用于：
- `https://YOUR_WORKER_URL/baidu/v1/usage`
- `https://YOUR_WORKER_URL/jd/v1/usage`
- `https://YOUR_WORKER_URL/zai/v1/usage`

如果你部署的是多 provider `gateway` 环境，也可以继续按前缀区分。

```js
({
  request: {
    url: "https://YOUR_WORKER_URL/baidu/v1/usage",
    method: "GET",
    headers: {
      accept: "application/json",
    },
  },

  extractor: function (response) {
    const isValid =
      response?.object === "usage" &&
      response?.provider &&
      Array.isArray(response?.quotas);

    if (!isValid) {
      return {
        isValid: false,
        invalidMessage: "未找到有效的 usage 数据",
        total: 0,
        unit: "times",
        used: 0,
        remaining: 0,
      };
    }

    const quotas = Array.isArray(response.quotas) ? response.quotas : [];

    const quotaByLabel = quotas.reduce((acc, quota) => {
      const label = quota?.window?.label;
      if (label) {
        acc[label] = quota;
      }
      return acc;
    }, {});

    const primaryQuota =
      quotaByLabel.fiveHour ||
      quotaByLabel["5hours"] ||
      quotaByLabel.week ||
      quotaByLabel["7days"] ||
      quotaByLabel.month ||
      quotas[0] ||
      null;

    if (!primaryQuota) {
      return {
        isValid: false,
        invalidMessage: "未找到配额信息",
        total: 0,
        unit: "times",
        used: 0,
        remaining: 0,
      };
    }

    const toQuotaInfo = (quota) => ({
      used: quota?.used || 0,
      limit: quota?.limit || 0,
      remaining:
        quota?.remaining != null
          ? quota.remaining
          : (quota?.limit || 0) - (quota?.used || 0),
      resetAt: quota?.reset_at || "",
      label: quota?.window?.label || "",
      unit: quota?.window?.unit || "",
      rolling: quota?.window?.rolling,
      scope: quota?.scope || "",
      metric: quota?.metric || "",
    });

    const primary = toQuotaInfo(primaryQuota);

    return {
      isValid: true,
      total: primary.limit,
      unit: primaryQuota?.metric === "requests" ? "times" : "tokens",
      used: primary.used,
      remaining: primary.remaining,
      percentage:
        typeof primaryQuota?.percent_used === "number"
          ? Math.round(primaryQuota.percent_used)
          : primary.limit > 0
            ? Math.round((primary.used / primary.limit) * 100)
            : 0,

      provider: response?.provider?.id || "",
      providerName: response?.provider?.name || "",

      planType: response?.plan?.tier || "",
      resourceStatus: response?.plan?.status || "",
      defaultModel: response?.plan?.default_model || "",

      quotas: {
        fiveHour: quotaByLabel.fiveHour
          ? toQuotaInfo(quotaByLabel.fiveHour)
          : null,
        week: quotaByLabel.week
          ? toQuotaInfo(quotaByLabel.week)
          : quotaByLabel["7days"]
            ? toQuotaInfo(quotaByLabel["7days"])
            : null,
        month: quotaByLabel.month
          ? toQuotaInfo(quotaByLabel.month)
          : null,
        rawList: quotas.map(toQuotaInfo),
      },

      models: Array.isArray(response?.models)
        ? response.models.map((model) => ({
            id: model.id,
            name: model.name,
            available: model.available,
            context: model?.limit?.context || null,
            output: model?.limit?.output || null,
          }))
        : [],

      raw: {
        planId: response?.plan?.id || "",
        planCode: response?.plan?.code || "",
        effectiveAt: response?.plan?.effective_at || "",
        expiresAt: response?.plan?.expires_at || "",
        observedAt: response?.observed_at || "",
        providerMeta: response?.provider_meta || {},
      },
    };
  },
});
```

如果你只关心某个固定窗口：
- 百度当前主配额通常看 `fiveHour`
- 京东当前常用窗口通常看 `5hours`
- 这份脚本会优先取 `fiveHour`，其次 `5hours`，再退回 `week/7days/month/第一个 quota`

所以同一个 extractor 可以直接复用到 baidu 和 jd。
