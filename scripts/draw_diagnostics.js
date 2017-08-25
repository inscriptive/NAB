const drawDiagnostics = async (file, highlighter) => {

  const data = await (new Promise((resolve, reject) => {
    d3.json(file, (error, response) => {
      if (error != null) {
        reject(error);
      } else {
        resolve(response);
      }
    })
  }));

  const container = d3.select("div.diagnostics");
  console.log(data);

  data.feature_ids.sort();
  const features = container.selectAll("div.feature")
    .data(data.feature_ids)
    .enter()
    .append("div")
    .attr("class", "feature-container");
  features.append("h3")
    .text((d) => d);

  const featureDrawers = [];
  features.each(function(featureId) {
    featureDrawers.push(drawFeatureAtPoint(d3.select(this), featureId, data.data, highlighter));
  });

  const redrawDiagnosticsAtTimestamp = (timestamp) => {
    const surpriseScores = new Map();
    featureDrawers.forEach((fd) => {
      const {surprise} = fd.redrawFeatureAtTimestamp(timestamp);
      surpriseScores.set(fd.featureId, surprise);
    });

    features.sort((f1, f2) => surpriseScores.get(f2) - surpriseScores.get(f1));
  };

  return {redrawDiagnosticsAtTimestamp};
};

const drawFeatureAtPoint = (container, featureId, data, highlighter) => {
  const relevantData = data.filter((d) => d.diagnostics.hasOwnProperty(featureId));

  const height = 230;
  const width = 500;

  const margin = {
    top: 10,
    left: 10,
    bottom: 35,
    right: 10
  };

  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const svg = container.append("svg")
    .attr("width", width)
    .attr("height", height)
    .append("g")
    .attr("width", innerWidth)
    .attr("height", innerHeight)
    .attr("transform", `translate(${margin.left}, ${margin.top})`);

  const xScale = d3.scaleLinear()
    .range([margin.left, innerWidth]);
  const xAxis = d3.axisBottom(xScale).ticks(5);
  const yScale = d3.scaleLinear()
    .range([innerHeight + margin.top, margin.top]);
  const yAxis = d3.axisLeft(yScale).ticks(5);

  const xAxisGroup = svg.append("g").attr("class", "xaxis")
    .attr("transform", `translate(0, ${innerHeight + margin.top})`);
  const yAxisGroup = svg.append("y").attr("class", "yaxis");
  const chart = svg.append("g").attr("class", "chart");

  const density = d3.area()
    .x((d) => xScale(d.x))
    .y0(() => yScale(0))
    .y1((d) => yScale(d.density));

  const densityPath = chart.append("path")
    .attr("fill", "steelblue")
    .attr("stroke", "grey");

  const currentValueMarker = chart.append("rect")
    .attr("width", 1)
    .attr("height", 100)
    .attr("y", margin.top + innerHeight - 100)
    .attr("fill", "red");

  const redrawFeatureAtTimestamp = (timestamp) => {
    const closestRelevantPoint = d3.bisector((d) => new Date(d.timestamp))
      .right(relevantData, timestamp);
    const currentDiagnostic = relevantData[Math.min(closestRelevantPoint, relevantData.length - 1)]
      .diagnostics[featureId];

    const {start_index, level, length} = currentDiagnostic;

    const gm = gaussianMixture(currentDiagnostic.density.components);
    xScale.domain(gm.xScaleDomain).nice(5);
    yScale.domain(gm.yScaleDomain).nice(5);
    console.log(currentDiagnostic);
    densityPath.datum(gm.densities)
      .attr("d", density);
    currentValueMarker.attr("x", xScale(currentDiagnostic.value));

    xAxisGroup.call(xAxis);
    yAxisGroup.call(yAxis);

    console.log(data);
    container
      .on("mouseover", () => {
        highlighter.highlight(
          new Date(data[baseStartIndex(start_index, level)].timestamp),
          new Date(data[baseStartIndex(start_index, level) + (length * (1 << level))].timestamp)
        )
      });

    return {
      surprise: 1.0 - (Math.sqrt(currentDiagnostic.density_at_value) / currentDiagnostic.expected_sqrt_density),
    }
  };

  return {featureId, redrawFeatureAtTimestamp};
};

const gaussianMixture = (components) => {
  const min = d3.min(components, (c) => c.mean - 5 * Math.sqrt(c.variance));
  const max = d3.max(components, (c) => c.mean + 5 * Math.sqrt(c.variance));
  const xs = d3.range(min, max, (max - min) / 100);
  const densities = xs.map((x) => {
    return { x: x, density: d3.sum(components, (comp) => gaussianDensity(comp)(x))}
  });
  const xScaleDomain = [min, max];
  const yScaleDomain = d3.extent(densities, (d) => d.density);
  return {
    xScaleDomain,
    yScaleDomain,
    densities
  };
};

const reciprocalSqrtTwoPi = 1.0 / Math.sqrt(2 * Math.PI);

const gaussianDensity = (component) => {
  const sigma = Math.sqrt(component.variance);
  return (x) => {
    const sigmas = (x - component.mean) / sigma;
    if (Math.abs(sigmas) > 8) {
      return 0.0;
    }
    return reciprocalSqrtTwoPi * Math.exp(-0.5 * sigmas * sigmas);
  }
};

const baseStartIndex = (startIndex, level) => {
  if (level === 0) {
    return startIndex;
  }
  return baseStartIndex(startIndex * 2, level - 1);
};