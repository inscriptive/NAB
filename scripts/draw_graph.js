const drawGraph = async(container, file) => {
  const data = await (new Promise((resolve, reject) => {
    d3.csv(file).get((error, response) => {
      if (error != null) {
        reject(error);
      } else {
        resolve(response);
      }
    })
  }));

  const allLabels = await (new Promise((resolve, reject) => {
    d3.json("combined_windows.json", (error, response) => {
      if (error != null) {
        reject(error);
      } else {
        resolve(response);
      }
    })
  }));
  const dataFileName = file.slice(20).replace("inscriptive_", "");
  const labels = allLabels[dataFileName];
  console.log(labels);
  console.log(data);

  const height = 300;
  const width = 1000;

  const margin = {
    top: 10,
    left: 30,
    bottom: 35,
    right: 30
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

  const xScale = d3.scaleTime()
    .domain([new Date(data[0].timestamp), new Date(data[data.length - 1].timestamp)])
    .range([margin.left, innerWidth + margin.left])
    .nice(5);
  const xAxis = d3.axisBottom(xScale)
    .ticks(5);

  const yScale = d3.scaleLinear()
    .domain(d3.extent(data, (d) => Number.parseFloat(d.value)))
    .range([innerHeight + margin.top, margin.top])
    .nice(5);
  const yAxis = d3.axisLeft(yScale)
    .ticks(5);

  const xAxisGroup = svg.append("g")
    .attr("class", "xaxis");

  const yAxisGroup = svg.append("g")
    .attr("class", "yaxis");

  const chart = svg.append("g")
    .attr("class", "chart");

  const dataLine = d3.line()
    .x((d) => xScale(new Date(d.timestamp)))
    .y((d) => yScale(d.value));

  const dataLinePath = chart.append("path")
    .datum(data)
    .attr("fill", "none")
    .attr("stroke", "steelblue");

  const anomalyScoreScale = d3.scaleLinear()
    .domain([0, 1])
    .range(yScale.range());
  const anomalyScoreAxis = d3.axisRight(anomalyScoreScale);
  const anomalyScoreAxisGroup = svg.append("g")
    .attr("class", "anomalyScore");

  const anomalyScoreLine = d3.line()
    .x(dataLine.x())
    .y((d) => {
      return anomalyScoreScale(d.anomaly_score);
    });

  const anomalyScoreLinePath = chart.append("path")
    .datum(data)
    .attr("fill", "none")
    .attr("stroke", "red")
    .attr("opacity", 0.2);

  const labeledAnomalies = chart.selectAll("rect.label")
    .data(labels)
    .enter()
    .append("rect")
    .attr("class", "label")
    .attr("height", innerHeight)
    .attr("y", margin.top)
    .attr("fill", "green")
    .attr("opacity", 0.1);

  const clickRuler = chart.append("rect")
    .datum([undefined])
    .attr("fill", "green")
    .attr("stroke", "green")
    .attr("width", 1)
    .attr("height", innerHeight)
    .attr("y", margin.top);

  const highlighter = {
    from: new Date(),
    to: new Date(),
  };

  const highlightRect = chart.append("rect")
    .attr("class", "highlight")
    .attr("fill", "orange")
    .attr("opacity", 0.3)
    .attr("width", 0)
    .attr("height", innerHeight)
    .attr("y", margin.top);
  const highlightPortionOfGraph = (from, to) => {
    const origin = new Date(data[0].timestamp).getTime();
    const period = new Date(data[1].timestamp).getTime() - origin;
    console.log(origin);
    console.log(period);
    highlighter.from = new Date(origin + from * period);
    highlighter.to = new Date(origin + to * period);
    console.log(highlighter);
    highlightRect
      .attr("width", xScale(highlighter.to) - xScale(highlighter.from))
      .attr("x", xScale(highlighter.from))
  };
  highlighter.highlight = highlightPortionOfGraph;
  highlighter.turnOff = () => highlightPortionOfGraph(new Date(0), new Date(0));

  const draw = () => {
    xAxisGroup
      .call(xAxis)
      .attr("transform", `translate(0, ${innerHeight + margin.top})`);
    yAxisGroup
      .call(yAxis)
      .attr("transform", `translate(${margin.left}, 0)`);
    anomalyScoreAxisGroup
      .call(anomalyScoreAxis)
      .attr("transform", `translate(${innerWidth}, 0)`);

    dataLinePath.attr("d", dataLine);
    anomalyScoreLinePath.attr("d", anomalyScoreLine);
    labeledAnomalies.attr("x", (label) => xScale(new Date(label[0])))
      .attr("width", (label) => xScale(new Date(label[1])) - xScale(new Date(label[0])));

    highlightRect
      .attr("width", xScale(highlighter.to) - xScale(highlighter.from))
      .attr("x", xScale(highlighter.from))
  };

  const xScaleCopy = xScale.copy();
  const zoomer = d3.zoom()
    .scaleExtent([1, Infinity])
    .translateExtent([[xScale.range()[0], yScale.range()[1]], [xScale.range()[1], yScale.range()[1]]])
    .extent([[xScale.range()[0], yScale.range()[1]], [xScale.range()[1], yScale.range()[1]]])
    .on("zoom", () => {
      const t = d3.event.transform;
      xScale.domain(t.rescaleX(xScaleCopy).domain());
      draw();
    });

  chart.append("rect")
    .attr("class", "zoomable")
    .attr("width", width)
    .attr("height", height)
    .style("opacity", 0.0)
    .call(zoomer);

  const {redrawDiagnosticsAtTimestamp} = await drawDiagnostics(`${file}.diagnostics`, highlighter);

  chart.on("click", function() {
    const [mouseX, _] = d3.mouse(this);
    const timestamp = xScale.invert(mouseX);
    const canonicalTimestampIndex = getNearestCanonicalTimestampIndex(timestamp, data);
    redrawDiagnosticsAtTimestamp(canonicalTimestampIndex);
  });

  chart.on("mousemove", function() {
    const [mouseX, _] = d3.mouse(this);
    const timestamp = xScale.invert(mouseX);
    const canonicalTimestampIndex = getNearestCanonicalTimestampIndex(timestamp, data);
    clickRuler.attr("x", xScale(new Date(data[canonicalTimestampIndex].timestamp)));
  });

  draw();
};

const getNearestCanonicalTimestampIndex = (mouseTimestamp, data) => {
  const canonicalTimestampIndex = Math.min(data.length,
    d3.bisector((d) => new Date(d.timestamp)).left(data, mouseTimestamp));
  const otherCanonicalTimestampIndex = Math.max(0, canonicalTimestampIndex - 1);
  const canonicalTimestamp = new Date(data[canonicalTimestampIndex].timestamp);
  const otherCanonicalTimestamp = new Date(data[otherCanonicalTimestampIndex].timestamp);
  if (Math.abs(mouseTimestamp - canonicalTimestamp) < Math.abs(mouseTimestamp - otherCanonicalTimestamp)) {
    return canonicalTimestampIndex;
  } else {
    return otherCanonicalTimestampIndex;
  }
};
