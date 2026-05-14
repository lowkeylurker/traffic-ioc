// Traffic Data Processing Worker

self.onmessage = (e: MessageEvent) => {
  const { segmentFeatures, statuses } = e.data;

  if (!segmentFeatures || !statuses) {
    self.postMessage({ error: 'Missing data' });
    return;
  }

  const statusMap = new Map();
  for (const s of statuses) {
    statusMap.set(String(s.segmentId), s);
  }

  const LOS_COLORS: Record<string, string> = {
    'A': '#52C41A',
    'B': '#73D13D',
    'C': '#FAAD14',
    'D': '#D46B08',
    'E': '#CF1322',
    'F': '#820014',
  };

  const newFeatures = segmentFeatures.map((feature: { properties: Record<string, any> }) => {
    const segId = String(feature.properties.segmentId);
    const stat = statusMap.get(segId);

    if (stat) {
      const los = String(stat.losGrade || 'N/A').toUpperCase();
      const derivedColor = stat.color ?? LOS_COLORS[los] ?? '#d9d9d9';
      return {
        ...feature,
        properties: {
          ...feature.properties,
          avgSpeed: stat.avgSpeed,
          losGrade: los,
          color: derivedColor,
          isCorridor: stat.isCorridor ?? feature.properties.isCorridor,
          lastUpdated: stat.timestamp,
        },
      };
    }
    return feature;
  });

  self.postMessage({ features: newFeatures });
};
