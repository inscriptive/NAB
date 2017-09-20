import json
import datetime
from collections import defaultdict
import pprint

def parseTs1(s):
    return datetime.datetime.strptime(s, "%Y-%m-%d %H:%M:%S.%f")

def parseTs2(s):
    return datetime.datetime.strptime(s, "%Y-%m-%d %H:%M:%S")

# Expects a 2-list of string timestamps
def parseWindow(window):
    return [parseTs1(window[0]), parseTs1(window[1])]

def windowContains(window, ts):
    return window[0] <= ts and ts <= window[1]

with open("../labels/combined_windows.json", "r") as combinedWindowsFile:
    allWindows = json.load(combinedWindowsFile)

stats = {"tp": {"featureId": defaultdict(lambda: 0)}, "fp": {"featureId": defaultdict(lambda: 0)}}

for f in allWindows.keys():
    if "flatline" in f:
        continue
    windows = map(parseWindow, allWindows[f])
    parts = f.split("/")
    diagnosticsFileName = "results/inscriptive/" + parts[0] + "/inscriptive_" + parts[1] + ".diagnostics"
    with open(diagnosticsFileName, "r") as diagnosticsFile:
        diagnostics = json.load(diagnosticsFile)
        for diag in diagnostics["data"]:
            if not "diagnostics" in diag:
                continue
            d = diag["diagnostics"]
            ts = parseTs2(diag["timestamp"])
            truePositive = any(map(lambda w: windowContains(w, ts), windows))
            falsePositive = not truePositive
            if len(d) == 0:
                continue
            for featureId in d.keys():
                if truePositive:
                    stats["tp"]["featureId"][featureId] += 1
                else:
                    stats["fp"]["featureId"][featureId] += 1

pp = pprint.PrettyPrinter(indent = 2)
#pp.pprint(stats)

print "True Positives"
for featureId, count in sorted(stats["tp"]["featureId"].iteritems(), key = lambda x: list(x)[1]):
    print featureId, count

print
print "False Positives"
for featureId, count in sorted(stats["fp"]["featureId"].iteritems(), key = lambda x: list(x)[1]):
    print featureId, count
