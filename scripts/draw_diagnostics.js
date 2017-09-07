const drawDiagnostics = async(file, highlighter) => {

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

  const redrawDiagnosticsAtTimestamp = (index) => {
    const {timestamp, diagnostics} = data.data[index];
    container.selectAll("div.feature-container").remove();
    const features = container.selectAll("div.feature-container")
      .data(Object.keys(diagnostics), (d) => d);
    features.exit().remove();
    features.enter()
      .append("div")
      .attr("class", "feature-container")
      .append("h3")
      .text((d) => d);
    const surpriseScores = new Map();
    container.selectAll("div.feature-container").each(function (featureId) {
        const {surprise} = drawFeatureAtPoint(d3.select(this), featureId, diagnostics[featureId],
          highlighter);
        surpriseScores.set(featureId, surprise);
      });
    features.sort((f1, f2) => {
      console.log(f1);
      console.log(f2);

      return surpriseScores.get(f2) - surpriseScores.get(f1);
    }).order();
  };

  return {redrawDiagnosticsAtTimestamp};
};

const drawFeatureAtPoint = (container, featureId, diagnostic, highlighter) => {
  const height = 230;
  const width = 500;

  const margin = {
    top: 10,
    left: 20,
    bottom: 35,
    right: 10
  };

  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const svg = container.selectAll("svg")
    .data([undefined])
    .enter()
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .append("g")
    .attr("width", innerWidth)
    .attr("height", innerHeight)
    .attr("transform", `translate(${margin.left}, ${margin.top})`);

  const info = container.selectAll("div")
    .data([undefined])
    .enter()
    .append("div");
  info.append("text").text(`ExpectedDensity: ${diagnostic.expected_density}`);
  info.append("text").text(`CurrentDensity: ${diagnostic.density_at_value}`);
  info.append("text").text(`Order: ${diagnostic.order}`);

  const xScale = d3.scaleLinear()
    .range([margin.left, innerWidth]);
  const xAxis = d3.axisBottom(xScale).ticks(5);
  const yScale = d3.scaleLinear()
    .range([innerHeight + margin.top, margin.top]);
  const yAxis = d3.axisLeft(yScale).ticks(5);

  const xAxisGroup = svg.append("g").attr("class", "xaxis")
    .attr("transform", `translate(0, ${innerHeight + margin.top})`);
  const yAxisGroup = svg.append("g").attr("class", "yaxis")
    .attr("transform", `translate(${margin.left}, 0)`);
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

  const currentDiagnostic = diagnostic;

  const {base_start_index, base_end_index, level, length} = currentDiagnostic;

  const gm = gaussianMixture(currentDiagnostic.density.components);
  xScale.domain(gm.xScaleDomain).nice(5);
  yScale.domain(gm.yScaleDomain).nice(5);
  density
    .x((d) => xScale(d.x))
    .y0(() => yScale(0))
    .y1((d) => yScale(d.density));
  densityPath.datum(gm.densities)
    .attr("d", density);
  currentValueMarker.attr("x", xScale(currentDiagnostic.value));

  xAxisGroup.call(xAxis);
  yAxisGroup.call(yAxis);

  container
    .on("mouseover", () => {
      highlighter.highlight(base_start_index, base_end_index)
    });

  return {
    surprise: Math.max(0.0,
      1.0 - (currentDiagnostic.density_at_value / currentDiagnostic.expected_density)),
  };
};

const gaussianMixture = (components) => {
  const min = d3.min(components, (c) => c.mean - 5 * Math.sqrt(c.variance));
  const max = d3.max(components, (c) => c.mean + 5 * Math.sqrt(c.variance));
  const xs = d3.range(min, max, (max - min) / 100);
  const densities = xs.map((x) => {
    return {x: x, density: d3.sum(components, (comp) => gaussianDensity(comp)(x) * comp.weight)}
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
    return reciprocalSqrtTwoPi * Math.exp(-0.5 * sigmas * sigmas) / sigma;
  }
};

const baseStartIndex = (startIndex, level) => {
  if (level === 0) {
    return startIndex;
  }
  return baseStartIndex(startIndex * 2, level - 1);
};