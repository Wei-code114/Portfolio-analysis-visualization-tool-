"use client";

import { ChangeEvent, DragEvent, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Calculator,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  Database,
  Download,
  FileSpreadsheet,
  GripVertical,
  RotateCcw,
  Trash2,
  Upload,
} from "lucide-react";
import {
  Bar,
  CartesianGrid,
  LabelList,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type FundPoint = { date: string; value: number };
type Metrics = {
  returnValue: number | null;
  risk: number | null;
  trendReturn: number;
  trendRisk: number;
  trendRatio: number;
  roi: number;
  mdd: number;
  days: number;
};
type ParsedData = {
  points: FundPoint[];
  averageAei: number | null;
  aeiProfit: number | null;
  aeiRisk: number | null;
};
type Analysis = {
  id: string;
  fileName: string;
  legendName: string;
  lineColor: string;
  points: FundPoint[];
  averageAei: number | null;
  metrics: Metrics;
};
type FailedFile = { fileName: string; message: string };

const INITIAL_FUND = 10_000_000,
  EXPECTED_DAYS = 1300;
const DEFAULT_RISK_COLOR = "#64748b",
  DEFAULT_PROFIT_COLOR = "#2563eb",
  DEFAULT_AEI_COLOR = "#d97706";
const FUND_LINE_COLORS = [
  "#1726e8",
  "#00a516",
  "#f59e0b",
  "#8a8a8a",
  "#dc2626",
  "#7c3aed",
  "#0891b2",
  "#db2777",
  "#65a30d",
  "#0f766e",
];
const money = new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 2 });

function splitCsvLine(line: string) {
  const cells: string[] = [];
  let value = "",
    quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        value += '"';
        i++;
      } else quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(value.trim());
      value = "";
    } else value += char;
  }
  cells.push(value.trim());
  return cells;
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

function calculateAeiFromPoints(points: FundPoint[]) {
  const yearly = new Map<string, number[]>();
  for (const point of points) {
    const year = point.date.trim().slice(0, 4);
    if (!/^\d{4}$/.test(year)) continue;
    const values = yearly.get(year) ?? [];
    values.push(point.value);
    yearly.set(year, values);
  }

  const yearlyResults = [...yearly.values()]
    .filter((values) => values.length >= 2)
    .map((values) => {
      const D = values.length;
      const profit = (values[D - 1] - values[0]) / (D - 1);
      const squaredError = values.reduce((sum, value, index) => {
        const fitted = values[0] + profit * index;
        return sum + (fitted - value) ** 2;
      }, 0);
      const risk = Math.sqrt(squaredError / D);
      return {
        profit,
        risk,
        aei: risk > Number.EPSILON ? profit / risk : null,
      };
    });

  if (!yearlyResults.length)
    return { averageAei: null, aeiProfit: null, aeiRisk: null };
  const validAei = yearlyResults.flatMap((result) =>
    result.aei === null ? [] : [result.aei],
  );
  return {
    averageAei: validAei.length
      ? validAei.reduce((sum, value) => sum + value, 0) / validAei.length
      : null,
    aeiProfit:
      yearlyResults.reduce((sum, result) => sum + result.profit, 0) /
      yearlyResults.length,
    aeiRisk:
      yearlyResults.reduce((sum, result) => sum + result.risk, 0) /
      yearlyResults.length,
  };
}

function parseFundData(text: string): ParsedData {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim());
  const headerIndex = lines.findIndex((line) => {
    const h = splitCsvLine(line).map(normalizeHeader);
    return h.includes("date") && h.includes("total_fs");
  });
  if (headerIndex < 0) throw new Error("找不到 Date 與 total_FS 欄位");
  const headers = splitCsvLine(lines[headerIndex]).map(normalizeHeader);
  const dateIndex = headers.indexOf("date"),
    valueIndex = headers.indexOf("total_fs");
  const averageRow = lines
    .slice(0, headerIndex)
    .map(splitCsvLine)
    .find((cells) => normalizeHeader(cells[0] ?? "") === "average_aei");
  const valueAfter = (label: string) => {
    if (!averageRow) return null;
    const index = averageRow.findIndex(
      (cell) => normalizeHeader(cell) === label,
    );
    if (index < 0) return null;
    const value = Number(averageRow[index + 1]);
    return Number.isFinite(value) ? value : null;
  };
  const averageValue = valueAfter("average_aei"),
    aeiProfit = valueAfter("average_aei_profit"),
    aeiRisk = valueAfter("average_aei_risk");
  const points = lines
    .slice(headerIndex + 1)
    .map(splitCsvLine)
    .map((cells) => ({
      date: cells[dateIndex]?.trim() ?? "",
      value: Number((cells[valueIndex] ?? "").replace(/,/g, "")),
    }))
    .filter((point) => point.date && Number.isFinite(point.value));
  if (points.length < 2) throw new Error("有效的 total_FS 資料少於 2 筆");
  const calculated = calculateAeiFromPoints(points);
  return {
    points,
    averageAei: averageValue ?? calculated.averageAei,
    aeiProfit: aeiProfit ?? calculated.aeiProfit,
    aeiRisk: aeiRisk ?? calculated.aeiRisk,
  };
}

function summaryMetrics(
  points: FundPoint[],
  aeiProfit: number | null,
  aeiRisk: number | null,
): Metrics {
  const D = points.length,
    firstFund = points[0].value;
  let s2 = 0,
    s3 = 0,
    s4 = 0,
    z1 = 0,
    z2 = 0;
  for (let index = 0; index < D; index++) {
    const t = index + 1,
      u = t / D,
      u2 = u * u,
      delta = points[index].value - firstFund;
    s2 += u2;
    s3 += u2 * u;
    s4 += u2 * u2;
    z1 += u * delta;
    z2 += u2 * delta;
  }
  const determinant = s4 * s2 - s3 * s3;
  const A = determinant === 0 ? 0 : (z2 * s2 - z1 * s3) / determinant;
  const B = determinant === 0 ? 0 : (s4 * z1 - s3 * z2) / determinant;
  let weightedSlope = 0,
    weightTotal = 0,
    squaredError = 0;
  for (let index = 0; index < D; index++) {
    const t = index + 1,
      u = t / D;
    const fitted = A * u * u + B * u + firstFund;
    const slope = (2 * A * u + B) / D;
    weightedSlope += t * slope;
    weightTotal += t;
    squaredError += (points[index].value - fitted) ** 2;
  }
  const trendReturn = weightedSlope / weightTotal;
  const rawTrendRisk = Math.sqrt(squaredError / D);
  const trendRisk = rawTrendRisk < 1e-9 ? 0 : rawTrendRisk;
  const trendRatio =
    trendReturn > 0
      ? trendRisk === 0
        ? Number.POSITIVE_INFINITY
        : trendReturn / trendRisk
      : trendReturn < 0
        ? trendReturn * trendRisk
        : 0;
  const roi = ((points[D - 1].value / firstFund) - 1) * 100;
  let peak = points[0].value, mdd = 0;
  for (const point of points) {
    if (point.value > peak) peak = point.value;
    if (peak !== 0) mdd = Math.max(mdd, ((peak - point.value) / peak) * 100);
  }
  return {
    returnValue: aeiProfit,
    risk: aeiRisk,
    trendReturn,
    trendRisk,
    trendRatio,
    roi,
    mdd,
    days: D,
  };
}

function formatTrendRatio(value: number) {
  return Number.isFinite(value) ? value.toFixed(6) : "∞";
}

function formatOptionalMoney(value: number | null) {
  return value === null ? "—" : money.format(value);
}

function chartLabel(fileName: string, index: number) {
  const match = fileName.match(/(?:^|[_-])(\d+)d(?:[-_.]|$)/i);
  return match ? `${match[1]}D` : `資料 ${index + 1}`;
}

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const comparisonChartRef = useRef<HTMLDivElement>(null);
  const fundComparisonChartRef = useRef<HTMLDivElement>(null);
  const riskReturnChartRef = useRef<HTMLDivElement>(null);
  const roiMddChartRef = useRef<HTMLDivElement>(null);
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [failedFiles, setFailedFiles] = useState<FailedFile[]>([]);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [initialFund, setInitialFund] = useState(INITIAL_FUND);
  const [dragging, setDragging] = useState(false);
  const [riskColor, setRiskColor] = useState(DEFAULT_RISK_COLOR);
  const [profitColor, setProfitColor] = useState(DEFAULT_PROFIT_COLOR);
  const [aeiColor, setAeiColor] = useState(DEFAULT_AEI_COLOR);
  const [showAeiBars, setShowAeiBars] = useState(false);
  const [chartTitle, setChartTitle] = useState("");
  const [fundComparisonChartTitle, setFundComparisonChartTitle] = useState("");
  const [riskReturnChartTitle, setRiskReturnChartTitle] = useState("");
  const [roiMddChartTitle, setRoiMddChartTitle] = useState("");
  const [tableCopied, setTableCopied] = useState(false);

  const recalculated = analyses;
  const selected = recalculated[selectedIndex] ?? recalculated[0] ?? null;
  const comparisonData = useMemo(() => {
    const raw = recalculated
      .filter((item) => checkedIds.has(item.id))
      .map((item, index) => ({
        label:
          item.legendName.trim() || chartLabel(item.fileName, index),
        fileName: item.fileName,
        risk: item.metrics.risk,
        profit: item.metrics.returnValue,
        trendRisk: item.metrics.trendRisk,
        trendReturn: item.metrics.trendReturn,
        trendRatio: item.metrics.trendRatio,
        roi: item.metrics.roi,
        mdd: item.metrics.mdd,
        aei: item.averageAei,
      }));
    const maxRisk = Math.max(
      ...raw.map((item) => item.risk ?? 0),
      1,
    );
    const maxAei = Math.max(...raw.map((item) => item.aei ?? 0), 0);
    return raw.map((item) => ({
      ...item,
      aeiDisplay:
        maxAei > 0 ? ((item.aei ?? 0) / maxAei) * maxRisk * 0.88 : 0,
    }));
  }, [recalculated, checkedIds]);
  const aeiComparisonData = useMemo(
    () =>
      comparisonData.filter(
        (item) => item.risk !== null && item.profit !== null,
      ),
    [comparisonData],
  );
  const selectedAnalyses = useMemo(
    () => recalculated.filter((item) => checkedIds.has(item.id)),
    [recalculated, checkedIds],
  );
  const fundComparisonData = useMemo(() => {
    const length = Math.max(
      0,
      ...selectedAnalyses.map((item) => item.points.length),
    );
    return Array.from({ length }, (_, index) => {
      const row: Record<string, number> = { day: index + 1 };
      for (const item of selectedAnalyses) {
        const point = item.points[index];
        if (point) row[item.id] = point.value;
      }
      return row;
    });
  }, [selectedAnalyses]);
  const displayedChartTitle =
    chartTitle.trim() ||
    (showAeiBars
      ? "AEI Profit, Risk, and Average AEI across Training Days"
      : "AEI Profit and Risk across Training Days");
  const displayedFundComparisonTitle =
    fundComparisonChartTitle.trim() ||
    "Comparison of Fund Standardization Across Strategies";
  const displayedRiskReturnTitle =
    riskReturnChartTitle.trim() || "TR Risk–Return Map by Training Days";
  const displayedRoiMddTitle =
    roiMddChartTitle.trim() || "ROI and MDD across Training Days";

  async function loadFiles(fileList?: FileList | File[]) {
    const files = Array.from(fileList ?? []);
    if (!files.length) return;
    const valid: Analysis[] = [],
      failed: FailedFile[] = [];
    for (const file of files) {
      if (!file.name.toLowerCase().endsWith(".csv")) {
        failed.push({ fileName: file.name, message: "不是 CSV 檔案" });
        continue;
      }
      try {
        const parsed = parseFundData(await file.text());
        valid.push({
          id: crypto.randomUUID(),
          fileName: file.name,
          legendName: file.name.replace(/\.csv$/i, ""),
          lineColor:
            FUND_LINE_COLORS[
              (analyses.length + valid.length) % FUND_LINE_COLORS.length
            ],
          points: parsed.points,
          averageAei: parsed.averageAei,
          metrics: summaryMetrics(
            parsed.points,
            parsed.aeiProfit,
            parsed.aeiRisk,
          ),
        });
      } catch (reason) {
        failed.push({
          fileName: file.name,
          message: reason instanceof Error ? reason.message : "讀取失敗",
        });
      }
    }
    setAnalyses((current) => [...current, ...valid]);
    setFailedFiles((current) => [...current, ...failed]);
    if (analyses.length === 0 && valid.length > 0) setSelectedIndex(0);
    if (inputRef.current) inputRef.current.value = "";
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    void loadFiles(event.dataTransfer.files);
  }
  function reset() {
    setAnalyses([]);
    setFailedFiles([]);
    setCheckedIds(new Set());
    setSelectedIndex(0);
    setInitialFund(INITIAL_FUND);
    setRiskColor(DEFAULT_RISK_COLOR);
    setProfitColor(DEFAULT_PROFIT_COLOR);
    setAeiColor(DEFAULT_AEI_COLOR);
    setShowAeiBars(false);
    setChartTitle("");
    setFundComparisonChartTitle("");
    setRiskReturnChartTitle("");
    setRoiMddChartTitle("");
    if (inputRef.current) inputRef.current.value = "";
  }
  function toggleChecked(id: string) {
    setCheckedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setCheckedIds((current) =>
      current.size === recalculated.length
        ? new Set()
        : new Set(recalculated.map((item) => item.id)),
    );
  }
  function deleteChecked() {
    if (!checkedIds.size) return;
    setAnalyses((current) =>
      current.filter((item) => !checkedIds.has(item.id)),
    );
    setCheckedIds(new Set());
    setSelectedIndex(0);
  }
  function updateLegendName(id: string, legendName: string) {
    setAnalyses((current) =>
      current.map((item) =>
        item.id === id ? { ...item, legendName } : item,
      ),
    );
  }
  function updateLineColor(id: string, lineColor: string) {
    setAnalyses((current) =>
      current.map((item) =>
        item.id === id ? { ...item, lineColor } : item,
      ),
    );
  }
  function reorderFiles(sourceId: string, targetId: string) {
    if (sourceId === targetId) return;
    const currentSelectedId = analyses[selectedIndex]?.id;
    const next = [...analyses];
    const sourceIndex = next.findIndex((item) => item.id === sourceId),
      targetIndex = next.findIndex((item) => item.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const [moved] = next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, moved);
    setAnalyses(next);
    const nextSelectedIndex = next.findIndex(
      (item) => item.id === currentSelectedId,
    );
    setSelectedIndex(nextSelectedIndex < 0 ? 0 : nextSelectedIndex);
  }

  function downloadChart(
    container: HTMLDivElement | null,
    title: string,
    fileName: string,
  ) {
    const svg = container?.querySelector("svg.recharts-surface");
    if (!svg) return;
    const copy = svg.cloneNode(true) as SVGElement;
    copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    copy.setAttribute("width", "1400");
    copy.setAttribute("height", "720");
    const source = new XMLSerializer().serializeToString(copy);
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 1400;
      canvas.height = 720;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "#0f172a";
      context.font = "bold 32px Times New Roman";
      context.textAlign = "center";
      context.fillText(title, canvas.width / 2, 48);
      context.drawImage(image, 0, 70, canvas.width, 630);
      const link = document.createElement("a");
      link.download = fileName;
      link.href = canvas.toDataURL("image/png", 1);
      link.click();
      URL.revokeObjectURL(image.src);
    };
    image.src = URL.createObjectURL(
      new Blob([source], { type: "image/svg+xml;charset=utf-8" }),
    );
  }

  function downloadComparisonChart() {
    downloadChart(
      comparisonChartRef.current,
      displayedChartTitle,
      "AEI-profit-risk-comparison.png",
    );
  }
  function downloadFundComparisonChart() {
    downloadChart(
      fundComparisonChartRef.current,
      displayedFundComparisonTitle,
      "fund-standardization-comparison.png",
    );
  }
  function downloadRiskReturnChart() {
    downloadChart(
      riskReturnChartRef.current,
      displayedRiskReturnTitle,
      "TR-risk-return-map.png",
    );
  }
  function downloadRoiMddChart() {
    downloadChart(
      roiMddChartRef.current,
      displayedRoiMddTitle,
      "ROI-MDD-training-days.png",
    );
  }

  function selectedTableRows() {
    return comparisonData.map((item) => [
      item.label,
      item.profit ?? "",
      item.risk ?? "",
      item.aei ?? "",
      item.trendReturn,
      item.trendRisk,
      item.trendRatio,
      item.roi,
      item.mdd,
    ]);
  }

  async function copyExcelTable() {
    const rows = [
      ["Legend Name", "AEI Return", "AEI Risk", "Average AEI", "TR Return", "TR Risk", "TR", "ROI (%)", "MDD (%)"],
      ...selectedTableRows(),
    ];
    await navigator.clipboard.writeText(
      rows.map((row) => row.join("\t")).join("\r\n"),
    );
    setTableCopied(true);
    window.setTimeout(() => setTableCopied(false), 1800);
  }

  function downloadSelectedCsv() {
    const escapeCell = (value: string | number) =>
      `"${String(value).replace(/"/g, '""')}"`;
    const rows = [
      ["Legend Name", "AEI Return", "AEI Risk", "Average AEI", "TR Return", "TR Risk", "TR", "ROI (%)", "MDD (%)"],
      ...selectedTableRows(),
    ];
    const csv =
      "\uFEFF" + rows.map((row) => row.map(escapeCell).join(",")).join("\r\n");
    const link = document.createElement("a");
    link.download = "portfolio-metrics-selected-data.csv";
    link.href = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  const chart = useMemo(() => {
    if (!selected) return null;
    const { points, metrics } = selected,
      width = 900,
      height = 250,
      pad = 18,
      step = Math.max(1, Math.floor(points.length / 220));
    const sampled = points
      .map((point, index) => ({ ...point, index }))
      .filter(({ index }) => index % step === 0 || index === points.length - 1);
    const values = [
      ...points.map((point) => point.value),
      initialFund,
      ...(metrics.returnValue === null
        ? []
        : [initialFund + metrics.returnValue * points.length]),
    ];
    const min = Math.min(...values),
      max = Math.max(...values),
      span = max - min || 1;
    const x = (i: number) =>
        pad + (i / (points.length - 1)) * (width - pad * 2),
      y = (v: number) => height - pad - ((v - min) / span) * (height - pad * 2);
    return {
      width,
      height,
      actual: sampled
        .map(
          (point) =>
            `${x(point.index).toFixed(1)},${y(point.value).toFixed(1)}`,
        )
        .join(" "),
      trend:
        metrics.returnValue === null
          ? null
          : `${x(0)},${y(initialFund + metrics.returnValue)} ${x(points.length - 1)},${y(initialFund + metrics.returnValue * points.length)}`,
    };
  }, [selected, initialFund]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-14">
        <header className="mb-9 flex flex-col gap-5 border-b border-border pb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-3 text-sm font-semibold tracking-[.16em] text-primary">
              GNQTS PORTFOLIO ANALYSIS
            </p>
            <h1 className="max-w-3xl text-3xl font-semibold tracking-tight sm:text-5xl">
              投資組合風險報酬計算器
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
              一次上傳多個每日資金水位 CSV，比較各檔案的 Average
              AEI、Return、Risk 與 Trend Ratio。
            </p>
          </div>
          {analyses.length > 0 && (
            <button
              onClick={reset}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-medium hover:bg-muted"
            >
              <RotateCcw size={16} />
              清除全部
            </button>
          )}
        </header>

        <section className="mb-7 grid gap-3 md:grid-cols-3" aria-label="使用說明">
          <details className="group rounded-xl border border-border bg-card shadow-sm open:md:col-span-3">
            <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 [&::-webkit-details-marker]:hidden">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <FileSpreadsheet size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">CSV 格式與範例</span>
                <span className="block truncate text-xs text-muted-foreground">Date、total_FS 與選填的 AEI 摘要列</span>
              </span>
              <ChevronDown size={17} className="shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <div className="grid gap-6 border-t border-border px-5 py-5 lg:grid-cols-[.9fr_1.1fr]">
              <div>
                <h3 className="text-sm font-semibold">必要欄位</h3>
                <div className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
                  <p><code className="font-semibold text-primary">Date</code>：日期，建議使用 YYYYMMDD，例如 20210104。</p>
                  <p><code className="font-semibold text-primary">total_FS</code>：每日資金水位，必須是數字；不讀取 <code>FL</code>。</p>
                </div>
                <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-6 text-muted-foreground">
                  <li>CSV 建議使用 UTF-8 編碼，每列代表一個交易日。</li>
                  <li>資料依日期由舊到新排序，最少 2 筆；筆數不限定為 1,300。</li>
                  <li><code>Average AEI</code> 摘要列可省略；網站會依年度自動計算 AEI、TR、ROI 與 MDD。</li>
                </ul>
              </div>
              <div>
                <div className="mb-3 flex items-baseline justify-between gap-2">
                  <h3 className="text-sm font-semibold">完整格式小範例</h3>
                  <span className="text-xs text-muted-foreground">第一列可省略</span>
                </div>
                <pre className="overflow-x-auto rounded-xl border border-border bg-muted/50 p-4 text-xs leading-6 sm:text-sm"><code>{`Average AEI,0.00863263,Average AEI profit,4110.416,Average AEI risk,685112.3
Date,total_FS
20210104,10000000
20210105,10084215.36
20210106,9967310.42`}</code></pre>
              </div>
            </div>
          </details>

          <details className="group rounded-xl border border-border bg-card shadow-sm open:md:col-span-3">
            <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 [&::-webkit-details-marker]:hidden">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-700"><Database size={18} /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">數值來源</span>
                <span className="block truncate text-xs text-muted-foreground">各項指標從哪裡取得</span>
              </span>
              <ChevronDown size={17} className="shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <div className="border-t border-border px-5 py-5">
              <p className="text-sm leading-6 text-muted-foreground">若 CSV 含有 Average AEI 摘要列，AEI Return、AEI Risk 與 Average AEI 會優先使用摘要值；若沒有，網站會依照 C++ 程式的方式，先逐年計算再取年度平均。TR Return、TR Risk 與 Trend Ratio 使用全部 <code>total_FS</code> 資料計算；ROI 使用首末資金水位，MDD 使用整段資料的最大峰值回撤。</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Formula title="AEI Return" formula="Average AEI profit" />
                <Formula title="AEI Risk" formula="Average AEI risk" />
              </div>
            </div>
          </details>

          <details className="group rounded-xl border border-border bg-card shadow-sm open:md:col-span-3">
            <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 [&::-webkit-details-marker]:hidden">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700"><Calculator size={18} /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">TR 定義與計算方式</span>
                <span className="block truncate text-xs text-muted-foreground">二次趨勢、趨勢報酬與趨勢風險</span>
              </span>
              <ChevronDown size={17} className="shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <div className="border-t border-border px-5 py-5">
              <p className="max-w-5xl text-sm leading-7 text-muted-foreground">TR 衡量資金水位的成長趨勢與波動程度。全部資料視為一個區間，不逐年平均；<i>FS</i><sub>t</sub> 為第 <i>t</i> 筆資金水位、<i>F</i><sub>0</sub> 為第一筆資金水位、<i>D</i> 為資料總筆數。</p>
              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <FormulaStep number="1" title="建立趨勢曲線" equation="Yₜ = at² + bt + F₀" description="以最小平方法擬合二次曲線；a 與 b 為擬合係數，常數項固定為第一筆資金水位。" />
                <FormulaStep number="2" title="計算 TR Return" equation="R = Σₜ₌₁ᴰ t(2at + b) ÷ Σₜ₌₁ᴰ t" description="以資料序號 t 加權二次曲線斜率。R 是趨勢成長速度，不是百分比報酬率。" />
                <FormulaStep number="3" title="計算 TR Risk" equation="Risk = √[ (1/D) Σₜ₌₁ᴰ (FSₜ − Yₜ)² ]" description="實際資金水位偏離趨勢曲線的均方根；越小表示越貼近趨勢曲線。" />
                <FormulaStep number="4" title="計算 TR" equation="R > 0：R/Risk　｜　R = 0：0　｜　R < 0：R × Risk" description="正趨勢採報酬除以風險，負趨勢採報酬乘以風險；不進行年化。" />
              </div>
              <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"><strong>特殊情況：</strong>當 R &gt; 0 且 Risk = 0 時，以「∞」標示。</p>
            </div>
          </details>
        </section>

        <section className="grid gap-6 lg:grid-cols-[.72fr_1.28fr]">
          <div className="space-y-5">
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <label
                className="mb-2 block text-sm font-semibold"
                htmlFor="initial-fund"
              >
                初始資金
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">
                  $
                </span>
                <input
                  id="initial-fund"
                  type="number"
                  min="1"
                  value={initialFund}
                  onChange={(e) =>
                    setInitialFund(Number(e.target.value) || INITIAL_FUND)
                  }
                  className="h-12 w-full rounded-xl border border-input bg-background pl-8 pr-4 text-lg font-semibold outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                />
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                用於繪製趨勢線；Return 與 Risk 直接讀取 CSV 摘要值。
              </p>
            </div>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={`rounded-2xl border-2 border-dashed p-7 text-center transition ${dragging ? "border-primary bg-primary/5" : "border-border bg-card"}`}
            >
              <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Upload size={23} />
              </div>
              <h2 className="text-lg font-semibold">上傳多個 CSV</h2>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
                可一次選取或拖曳多個檔案。讀取 <code>Date</code>、
                <code>total_FS</code> 與選填的 <code>Average AEI</code> 摘要，不使用{" "}
                <code>FL</code>。
              </p>
              <input
                ref={inputRef}
                multiple
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  void loadFiles(e.target.files ?? undefined)
                }
              />
              <button
                onClick={() => inputRef.current?.click()}
                className="mt-5 inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90"
              >
                <FileSpreadsheet size={17} />
                選擇多個 CSV
              </button>
              {analyses.length > 0 && (
                <p className="mt-4 text-sm font-medium text-primary">
                  已成功讀取 {analyses.length} 個檔案
                </p>
              )}
            </div>
            {failedFiles.length > 0 && (
              <div className="rounded-xl border border-destructive/25 bg-destructive/5 p-4 text-sm text-destructive">
                <div className="mb-2 flex items-center gap-2 font-semibold">
                  <AlertCircle size={18} />有 {failedFiles.length}{" "}
                  個檔案無法讀取
                </div>
                {failedFiles.map((file) => (
                  <p key={file.fileName} className="mt-1 break-all">
                    {file.fileName}：{file.message}
                  </p>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7">
            {!selected ? (
              <EmptyState />
            ) : (
              <div>
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-muted-foreground">目前檢視</p>
                    <h2
                      className="mt-1 truncate text-xl font-semibold"
                      title={selected.fileName}
                    >
                      {selected.fileName}
                    </h2>
                  </div>
                  <DayBadge days={selected.metrics.days} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <MetricCard
                    label="Average AEI"
                    value={
                      selected.averageAei === null
                        ? "—"
                        : selected.averageAei.toFixed(6)
                    }
                    unit="CSV 摘要值"
                    tone
                  />
                  <MetricCard
                    label="Return"
                    value={formatOptionalMoney(selected.metrics.returnValue)}
                    unit="Average AEI profit"
                    tone
                  />
                  <MetricCard
                    label="Risk"
                    value={formatOptionalMoney(selected.metrics.risk)}
                    unit="Average AEI risk"
                  />
                  <MetricCard
                    label="Trend Ratio"
                    value={formatTrendRatio(selected.metrics.trendRatio)}
                    unit="全部 total_FS 的二次趨勢"
                    tone
                  />
                </div>
                {selected.metrics.days !== EXPECTED_DAYS && (
                  <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    預期 1,300 筆，目前讀到{" "}
                    {selected.metrics.days.toLocaleString()}{" "}
                    筆；仍依實際筆數完成計算。
                  </p>
                )}
                {chart && (
                  <div className="mt-6">
                    <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                      <span>{selected.points[0].date}</span>
                      <span>{selected.points.at(-1)?.date}</span>
                    </div>
                    <div className="overflow-hidden rounded-xl border border-border bg-[linear-gradient(to_bottom,var(--muted)_1px,transparent_1px)] bg-[size:100%_25%]">
                      <svg
                        viewBox={`0 0 ${chart.width} ${chart.height}`}
                        className="h-auto w-full"
                        role="img"
                        aria-label="total_FS 實際資金水位與線性趨勢線"
                      >
                        <polyline
                          points={chart.actual}
                          fill="none"
                          stroke="var(--chart-1)"
                          strokeWidth="3"
                          strokeLinejoin="round"
                        />
                        {chart.trend && (
                          <polyline
                            points={chart.trend}
                            fill="none"
                            stroke="var(--chart-2)"
                            strokeWidth="3"
                            strokeDasharray="9 7"
                          />
                        )}
                      </svg>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-5 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-2">
                        <i className="h-.5 w-5 bg-[var(--chart-1)]" />
                        total_FS 資金水位
                      </span>
                      {chart.trend && (
                        <span className="inline-flex items-center gap-2">
                          <i className="h-.5 w-5 border-t-2 border-dashed border-[var(--chart-2)]" />
                          線性趨勢線
                        </span>
                      )}
                    </div>
                  </div>
                )}
                <div className="mt-6 grid grid-cols-2 gap-3 border-t border-border pt-5 text-sm">
                  <DataItem label="起始日期" value={selected.points[0].date} />
                  <DataItem
                    label="結束日期"
                    value={selected.points.at(-1)?.date ?? "—"}
                  />
                  <DataItem
                    label="首筆 total_FS"
                    value={money.format(selected.points[0].value)}
                  />
                  <DataItem
                    label="末筆 total_FS"
                    value={money.format(selected.points.at(-1)?.value ?? 0)}
                  />
                </div>
              </div>
            )}
          </div>
        </section>

        {recalculated.length > 0 && (
          <section className="mt-7 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-sm text-muted-foreground">全部結果</p>
                <h2 className="mt-1 text-xl font-semibold">檔案比較表</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  勾選要繪製的資料；拖曳左側把手可同步調整表格與圖表順序。
                </p>
              </div>
              <button
                onClick={deleteChecked}
                disabled={!checkedIds.size}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-destructive/30 px-4 text-sm font-medium text-destructive transition hover:bg-destructive/5 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Trash2 size={16} />
                刪除所選{checkedIds.size > 0 ? `（${checkedIds.size}）` : ""}
              </button>
            </div>
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[1620px] border-collapse text-sm">
                <thead className="bg-muted text-left text-muted-foreground">
                  <tr>
                    <th className="w-10 px-2 py-3">
                      <span className="sr-only">拖曳排序</span>
                    </th>
                    <th className="w-12 px-4 py-3">
                      <input
                        type="checkbox"
                        aria-label="全選檔案"
                        checked={
                          checkedIds.size === recalculated.length &&
                          recalculated.length > 0
                        }
                        onChange={toggleAll}
                        className="size-4 accent-[var(--primary)]"
                      />
                    </th>
                    <th className="px-4 py-3 font-medium">檔案名稱</th>
                    <th className="px-4 py-3 font-medium">圖例名稱</th>
                    <th className="px-4 py-3 text-center font-medium">
                      線條顏色
                    </th>
                    <th className="px-4 py-3 text-right font-medium">
                      Average AEI
                    </th>
                    <th className="px-4 py-3 text-right font-medium">Return</th>
                    <th className="px-4 py-3 text-right font-medium">Risk</th>
                    <th className="px-4 py-3 text-right font-medium">
                      Trend Ratio
                    </th>
                    <th className="px-4 py-3 text-right font-medium">ROI</th>
                    <th className="px-4 py-3 text-right font-medium">MDD</th>
                    <th className="px-4 py-3 text-right font-medium">筆數</th>
                    <th className="px-4 py-3 font-medium">日期範圍</th>
                  </tr>
                </thead>
                <tbody>
                  {recalculated.map((item, index) => (
                    <tr
                      key={item.id}
                      draggable
                      onDragStart={() => setDraggedId(item.id)}
                      onDragEnd={() => {
                        setDraggedId(null);
                        setDragOverId(null);
                      }}
                      onDragOver={(event) => {
                        event.preventDefault();
                        setDragOverId(item.id);
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        if (draggedId) reorderFiles(draggedId, item.id);
                        setDraggedId(null);
                        setDragOverId(null);
                      }}
                      onClick={() => setSelectedIndex(index)}
                      className={`cursor-pointer border-t border-border transition hover:bg-muted/70 ${index === selectedIndex ? "bg-primary/5" : ""} ${draggedId === item.id ? "opacity-40" : ""} ${dragOverId === item.id && draggedId !== item.id ? "outline outline-2 -outline-offset-2 outline-primary/50" : ""}`}
                    >
                      <td className="px-2 py-3 text-muted-foreground">
                        <span
                          className="inline-flex cursor-grab rounded p-1 hover:bg-muted active:cursor-grabbing"
                          title="拖曳調整位置"
                        >
                          <GripVertical size={18} />
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          aria-label={`選取 ${item.fileName}`}
                          checked={checkedIds.has(item.id)}
                          onClick={(event) => event.stopPropagation()}
                          onChange={() => toggleChecked(item.id)}
                          className="size-4 accent-[var(--primary)]"
                        />
                      </td>
                      <td
                        className="max-w-[310px] truncate px-4 py-3 font-medium"
                        title={item.fileName}
                      >
                        {item.fileName}
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="text"
                          value={item.legendName}
                          onClick={(event) => event.stopPropagation()}
                          onMouseDown={(event) => event.stopPropagation()}
                          onChange={(event) =>
                            updateLegendName(item.id, event.target.value)
                          }
                          aria-label={`修改 ${item.fileName} 的圖例名稱`}
                          className="h-9 w-64 rounded-lg border border-input bg-background px-3 font-serif text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                        />
                      </td>
                      <td className="px-4 py-2 text-center">
                        <input
                          type="color"
                          value={item.lineColor}
                          onClick={(event) => event.stopPropagation()}
                          onMouseDown={(event) => event.stopPropagation()}
                          onChange={(event) =>
                            updateLineColor(item.id, event.target.value)
                          }
                          aria-label={`選擇 ${item.legendName || item.fileName} 的線條顏色`}
                          className="h-8 w-12 cursor-pointer rounded border border-input bg-transparent p-1"
                        />
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        {item.averageAei === null
                          ? "—"
                          : item.averageAei.toFixed(6)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        {formatOptionalMoney(item.metrics.returnValue)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        {formatOptionalMoney(item.metrics.risk)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-primary">
                        {formatTrendRatio(item.metrics.trendRatio)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        {item.metrics.roi.toFixed(2)}%
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        {item.metrics.mdd.toFixed(2)}%
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        {item.metrics.days.toLocaleString()}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">
                        {item.points[0].date}–{item.points.at(-1)?.date}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-7 border-t border-border pt-7">
              <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">資金水位 × 天數</p>
                  <h2 className="mt-1 text-xl font-semibold">
                    Fund Standardization 比較圖
                  </h2>
                </div>
                <label className="min-w-[280px] flex-1 sm:max-w-xl">
                  <span className="mb-1.5 block text-sm font-semibold">
                    圖表標題
                  </span>
                  <input
                    type="text"
                    value={fundComparisonChartTitle}
                    onChange={(event) =>
                      setFundComparisonChartTitle(event.target.value)
                    }
                    placeholder="Comparison of Fund Standardization Across Strategies"
                    className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                  />
                </label>
                <button
                  onClick={downloadFundComparisonChart}
                  disabled={!fundComparisonData.length}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Download size={16} />
                  下載 PNG
                </button>
              </div>
              {fundComparisonData.length === 0 ? (
                <div className="flex min-h-52 items-center justify-center rounded-xl border border-dashed border-border bg-muted/35 px-6 text-center text-sm text-muted-foreground">
                  請勾選表格中的檔案，即可比較各策略與 DJIA-index 的
                  total_FS 資金水位走勢。
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-border bg-white p-3 sm:p-6">
                  <div
                    ref={fundComparisonChartRef}
                    className="h-[520px] min-w-[760px] font-serif"
                  >
                    <h3 className="mb-2 text-center text-lg font-bold text-slate-900 sm:text-2xl">
                      {displayedFundComparisonTitle}
                    </h3>
                    <ResponsiveContainer width="100%" height="92%">
                      <LineChart
                        data={fundComparisonData}
                        margin={{ top: 26, right: 34, left: 48, bottom: 24 }}
                      >
                        <CartesianGrid
                          stroke="#d8dee4"
                          strokeDasharray="3 3"
                        />
                        <XAxis
                          type="number"
                          dataKey="day"
                          domain={[0, "dataMax"]}
                          tickMargin={10}
                          tick={{
                            fill: "#0f172a",
                            fontSize: 12,
                            fontWeight: 700,
                            fontFamily: "Times New Roman",
                          }}
                          axisLine={{ stroke: "#64748b" }}
                          tickLine={false}
                          label={{
                            value: "Days",
                            position: "insideBottom",
                            offset: -14,
                            fill: "#0f172a",
                            fontWeight: 700,
                            fontFamily: "Times New Roman",
                          }}
                        />
                        <YAxis
                          domain={["auto", "auto"]}
                          tickMargin={12}
                          tickFormatter={(value) => money.format(Number(value))}
                          tick={{
                            fill: "#0f172a",
                            fontSize: 12,
                            fontWeight: 700,
                            fontFamily: "Times New Roman",
                          }}
                          axisLine={{ stroke: "#64748b" }}
                          tickLine={false}
                          width={112}
                          label={{
                            value: "Fund Standardization",
                            angle: -90,
                            position: "insideLeft",
                            offset: -28,
                            fill: "#0f172a",
                            fontWeight: 700,
                            fontFamily: "Times New Roman",
                          }}
                        />
                        <Tooltip
                          formatter={(value, name) => [
                            money.format(Number(value)),
                            name,
                          ]}
                          labelFormatter={(value) => `Day: ${value}`}
                          contentStyle={{
                            borderRadius: 10,
                            borderColor: "#cbd5e1",
                            boxShadow: "0 8px 24px rgba(15,23,42,.12)",
                            fontFamily: "Times New Roman",
                            fontWeight: 700,
                          }}
                        />
                        <Legend
                          verticalAlign="top"
                          align="center"
                          iconType="line"
                          payload={selectedAnalyses.map((item) => ({
                            value:
                              item.legendName.trim() ||
                              item.fileName.replace(/\.csv$/i, ""),
                            type: "line" as const,
                            color: item.lineColor,
                          }))}
                          wrapperStyle={{
                            paddingBottom: 14,
                            fontFamily: "Times New Roman",
                            fontWeight: 700,
                          }}
                        />
                        {selectedAnalyses.map((item) => (
                          <Line
                            key={item.id}
                            type="linear"
                            dataKey={item.id}
                            name={
                              item.legendName.trim() ||
                              item.fileName.replace(/\.csv$/i, "")
                            }
                            stroke={item.lineColor}
                            strokeWidth={2.2}
                            dot={false}
                            activeDot={{ r: 4 }}
                            connectNulls={false}
                            isAnimationActive={false}
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="mt-2 text-center text-xs text-slate-500">
                    X 軸依檔案中的資料順序顯示 Days；Y 軸使用每個檔案的
                    total_FS 資金水位。
                  </p>
                </div>
              )}
            </div>

            <div className="mt-7 border-t border-border pt-7">
              <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">所選資料</p>
                  <h2 className="mt-1 text-xl font-semibold">
                    AEI Profit–Risk 比較圖
                  </h2>
                </div>
                <label className="min-w-[280px] flex-1 sm:max-w-xl">
                  <span className="mb-1.5 block text-sm font-semibold">
                    圖表標題
                  </span>
                  <input
                    type="text"
                    value={chartTitle}
                    onChange={(event) => setChartTitle(event.target.value)}
                    placeholder={
                      showAeiBars
                        ? "AEI Profit, Risk, and Average AEI across Training Days"
                        : "AEI Profit and Risk across Training Days"
                    }
                    className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                  />
                </label>
              </div>
              <div className="mb-5 flex flex-wrap items-center justify-end gap-3">
                <button
                  type="button"
                  role="switch"
                  aria-checked={showAeiBars}
                  onClick={() => setShowAeiBars((value) => !value)}
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium"
                >
                  <span
                    className={`relative h-5 w-9 rounded-full transition ${showAeiBars ? "bg-primary" : "bg-slate-300"}`}
                  >
                    <span
                      className={`absolute top-0.5 size-4 rounded-full bg-white shadow-sm transition-transform ${showAeiBars ? "translate-x-[18px]" : "translate-x-0.5"}`}
                    />
                  </span>
                  顯示 AEI 直條
                </button>
                <label className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium">
                  <input
                    type="color"
                    value={riskColor}
                    onChange={(event) => setRiskColor(event.target.value)}
                    className="size-6 cursor-pointer border-0 bg-transparent p-0"
                    aria-label="選擇 AEI Risk 顏色"
                  />
                  <span>AEI Risk</span>
                </label>
                <label className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium">
                  <input
                    type="color"
                    value={profitColor}
                    onChange={(event) => setProfitColor(event.target.value)}
                    className="size-6 cursor-pointer border-0 bg-transparent p-0"
                    aria-label="選擇 AEI Profit 顏色"
                  />
                  <span>AEI Profit</span>
                </label>
                {showAeiBars && (
                  <label className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium">
                    <input
                      type="color"
                      value={aeiColor}
                      onChange={(event) => setAeiColor(event.target.value)}
                      className="size-6 cursor-pointer border-0 bg-transparent p-0"
                      aria-label="選擇 Average AEI 顏色"
                    />
                    <span>Average AEI</span>
                  </label>
                )}
                <button
                  onClick={downloadComparisonChart}
                  disabled={!aeiComparisonData.length}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Download size={16} />
                  下載 PNG
                </button>
              </div>
              {aeiComparisonData.length === 0 ? (
                <div className="flex min-h-52 items-center justify-center rounded-xl border border-dashed border-border bg-muted/35 px-6 text-center text-sm text-muted-foreground">
                  請勾選檔案，即可繪製 AEI profit 與 AEI risk
                  雙軸折線圖；缺少摘要列時會由資金水位自動計算。
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-border bg-white p-3 sm:p-6">
                  <div
                    ref={comparisonChartRef}
                    className="h-[430px] min-w-[660px] font-serif"
                  >
                    <h3 className="mb-2 text-center text-lg font-bold text-slate-900 sm:text-xl">
                      {displayedChartTitle}
                    </h3>
                    <ResponsiveContainer width="100%" height="92%">
                      <LineChart
                        data={aeiComparisonData}
                        margin={{ top: 18, right: 32, left: 32, bottom: 20 }}
                      >
                        <CartesianGrid
                          stroke="#d8dee4"
                          strokeDasharray="3 3"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="label"
                          tick={{
                            fill: "#334155",
                            fontSize: 13,
                            fontWeight: 700,
                            fontFamily: "Times New Roman",
                          }}
                          axisLine={{ stroke: "#64748b" }}
                          tickLine={false}
                          label={{
                            value: "Strategies",
                            position: "insideBottom",
                            offset: -10,
                            fill: "#0f172a",
                            fontWeight: 700,
                            fontFamily: "Times New Roman",
                          }}
                        />
                        <YAxis
                          yAxisId="risk"
                          orientation="left"
                          tickMargin={12}
                          tickFormatter={(value) => money.format(Number(value))}
                          tick={{
                            fill: riskColor,
                            fontSize: 12,
                            fontWeight: 700,
                            fontFamily: "Times New Roman",
                          }}
                          axisLine={false}
                          tickLine={false}
                          width={110}
                          label={{
                            value: "AEI Risk",
                            angle: -90,
                            position: "insideLeft",
                            offset: 8,
                            fill: riskColor,
                            fontWeight: 700,
                            fontFamily: "Times New Roman",
                          }}
                        />
                        <YAxis
                          yAxisId="profit"
                          orientation="right"
                          tickMargin={12}
                          tickFormatter={(value) => money.format(Number(value))}
                          tick={{
                            fill: profitColor,
                            fontSize: 12,
                            fontWeight: 700,
                            fontFamily: "Times New Roman",
                          }}
                          axisLine={false}
                          tickLine={false}
                          width={104}
                          label={{
                            value: "AEI Profit",
                            angle: 90,
                            position: "insideRight",
                            offset: 8,
                            fill: profitColor,
                            fontWeight: 700,
                            fontFamily: "Times New Roman",
                          }}
                        />
                        <Tooltip
                          formatter={(value, name, item) =>
                            name === "Average AEI"
                              ? [
                                  item.payload.aei === null
                                    ? "—"
                                    : Number(item.payload.aei).toFixed(6),
                                  name,
                                ]
                              : [money.format(Number(value)), name]
                          }
                          labelFormatter={(label) => `Strategy: ${label}`}
                          contentStyle={{
                            borderRadius: 10,
                            borderColor: "#cbd5e1",
                            boxShadow: "0 8px 24px rgba(15,23,42,.12)",
                            fontFamily: "Times New Roman",
                            fontWeight: 700,
                          }}
                        />
                        <Legend
                          verticalAlign="top"
                          align="right"
                          iconType="line"
                          wrapperStyle={{
                            paddingBottom: 14,
                            fontFamily: "Times New Roman",
                            fontWeight: 700,
                          }}
                        />
                        {showAeiBars && (
                          <Bar
                            yAxisId="risk"
                            dataKey="aeiDisplay"
                            name="Average AEI"
                            fill={aeiColor}
                            fillOpacity={0.35}
                            radius={[4, 4, 0, 0]}
                            maxBarSize={42}
                          />
                        )}
                        <Line
                          yAxisId="risk"
                          type="linear"
                          dataKey="risk"
                          name="AEI Risk"
                          stroke={riskColor}
                          strokeWidth={2.5}
                          dot={{ r: 4, fill: riskColor, strokeWidth: 0 }}
                          activeDot={{ r: 6 }}
                        />
                        <Line
                          yAxisId="profit"
                          type="linear"
                          dataKey="profit"
                          name="AEI Profit"
                          stroke={profitColor}
                          strokeWidth={2.5}
                          dot={{ r: 4, fill: profitColor, strokeWidth: 0 }}
                          activeDot={{ r: 6 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="mt-2 text-center text-xs text-slate-500">
                    Average AEI 直條僅呈現相對高度，不使用座標軸；左側為 AEI
                    Risk，右側為 AEI Profit。
                  </p>
                </div>
              )}
            </div>

            <div className="mt-7 border-t border-border pt-7">
              <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">風險 × 報酬</p>
                  <h2 className="mt-1 text-xl font-semibold">訓練天數對應圖</h2>
                </div>
                <label className="min-w-[280px] flex-1 sm:max-w-xl">
                  <span className="mb-1.5 block text-sm font-semibold">
                    圖表標題
                  </span>
                  <input
                    type="text"
                    value={riskReturnChartTitle}
                    onChange={(event) =>
                      setRiskReturnChartTitle(event.target.value)
                    }
                    placeholder="TR Risk–Return Map by Training Days"
                    className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => void copyExcelTable()}
                    disabled={!comparisonData.length}
                    className="inline-flex h-10 items-center gap-2 rounded-lg border border-primary/30 bg-background px-4 text-sm font-semibold text-primary transition hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {tableCopied ? <Check size={16} /> : <Copy size={16} />}{" "}
                    {tableCopied ? "已複製" : "複製 Excel 表格"}
                  </button>
                  <button
                    onClick={downloadSelectedCsv}
                    disabled={!comparisonData.length}
                    className="inline-flex h-10 items-center gap-2 rounded-lg border border-primary/30 bg-background px-4 text-sm font-semibold text-primary transition hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Download size={16} />
                    下載 CSV
                  </button>
                  <button
                    onClick={downloadRiskReturnChart}
                    disabled={!comparisonData.length}
                    className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Download size={16} />
                    下載 PNG
                  </button>
                </div>
              </div>
              {comparisonData.length === 0 ? (
                <div className="flex min-h-52 items-center justify-center rounded-xl border border-dashed border-border bg-muted/35 px-6 text-center text-sm text-muted-foreground">
                  請勾選表格中的檔案，即可繪製風險－報酬散佈圖並標示訓練天數。
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto rounded-xl border border-border bg-white p-3 sm:p-6">
                    <div
                      ref={riskReturnChartRef}
                      className="h-[480px] min-w-[660px] font-serif"
                    >
                      <h3 className="mb-2 text-center text-lg font-bold text-slate-900 sm:text-xl">
                        {displayedRiskReturnTitle}
                      </h3>
                      <ResponsiveContainer width="100%" height="92%">
                        <ScatterChart
                          margin={{ top: 32, right: 62, left: 48, bottom: 34 }}
                        >
                          <CartesianGrid
                            stroke="#d8dee4"
                            strokeDasharray="3 3"
                          />
                          <XAxis
                            type="number"
                            dataKey="trendRisk"
                            name="TR Risk"
                            tickMargin={10}
                            tickFormatter={(value) =>
                              money.format(Number(value))
                            }
                            tick={{
                              fill: riskColor,
                              fontSize: 12,
                              fontWeight: 700,
                              fontFamily: "Times New Roman",
                            }}
                            axisLine={{ stroke: riskColor }}
                            tickLine={false}
                            label={{
                              value: "TR Risk",
                              position: "insideBottom",
                              offset: -20,
                              fill: riskColor,
                              fontWeight: 700,
                              fontFamily: "Times New Roman",
                            }}
                          />
                          <YAxis
                            type="number"
                            dataKey="trendReturn"
                            name="TR Return"
                            tickMargin={10}
                            tickFormatter={(value) =>
                              money.format(Number(value))
                            }
                            tick={{
                              fill: profitColor,
                              fontSize: 12,
                              fontWeight: 700,
                              fontFamily: "Times New Roman",
                            }}
                            axisLine={{ stroke: profitColor }}
                            tickLine={false}
                            width={92}
                            label={{
                              value: "TR Return",
                              angle: -90,
                              position: "insideLeft",
                              offset: -20,
                              fill: profitColor,
                              fontWeight: 700,
                              fontFamily: "Times New Roman",
                            }}
                          />
                          <Tooltip
                            cursor={{ strokeDasharray: "3 3" }}
                            formatter={(value, name) => [
                              money.format(Number(value)),
                              name,
                            ]}
                            labelFormatter={(_, payload) =>
                              payload?.[0]?.payload
                                ? `${payload[0].payload.label} · ${payload[0].payload.fileName}`
                                : ""
                            }
                            contentStyle={{
                              borderRadius: 10,
                              borderColor: "#cbd5e1",
                              boxShadow: "0 8px 24px rgba(15,23,42,.12)",
                              fontFamily: "Times New Roman",
                              fontWeight: 700,
                            }}
                          />
                          <Scatter
                            name="Strategies"
                            data={comparisonData}
                            fill={profitColor}
                            stroke="#ffffff"
                            strokeWidth={2}
                          >
                            <LabelList
                              dataKey="label"
                              position="top"
                              offset={10}
                              fill="#0f172a"
                              fontSize={13}
                              fontWeight={700}
                              fontFamily="Times New Roman"
                            />
                          </Scatter>
                        </ScatterChart>
                      </ResponsiveContainer>
                    </div>
                    <p className="mt-2 text-center text-xs text-slate-500">
                      每個圓點代表一個所選檔案；X 軸為 TR Risk，Y 軸為 TR
                      Return，標籤顯示訓練天數。
                    </p>
                  </div>
                  <div className="mt-4 overflow-x-auto rounded-xl border border-border">
                    <table className="w-full min-w-[1180px] border-collapse text-sm">
                      <thead className="bg-muted text-left">
                        <tr>
                          <th className="px-4 py-3 font-semibold">
                            Legend Name
                          </th>
                          <th className="px-4 py-3 text-right font-semibold">
                            AEI Return
                          </th>
                          <th className="px-4 py-3 text-right font-semibold">
                            AEI Risk
                          </th>
                          <th className="px-4 py-3 text-right font-semibold">
                            Average AEI
                          </th>
                          <th className="px-4 py-3 text-right font-semibold">
                            TR Return
                          </th>
                          <th className="px-4 py-3 text-right font-semibold">
                            TR Risk
                          </th>
                          <th className="px-4 py-3 text-right font-semibold">
                            TR
                          </th>
                          <th className="px-4 py-3 text-right font-semibold">
                            ROI (%)
                          </th>
                          <th className="px-4 py-3 text-right font-semibold">
                            MDD (%)
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {comparisonData.map((item) => (
                          <tr
                            key={item.fileName}
                            className="border-t border-border"
                          >
                            <td className="px-4 py-3 font-mono font-semibold">
                              {item.label}
                            </td>
                            <td className="px-4 py-3 text-right font-mono">
                              {item.profit === null ? "—" : item.profit}
                            </td>
                            <td className="px-4 py-3 text-right font-mono">
                              {item.risk === null ? "—" : item.risk}
                            </td>
                            <td className="px-4 py-3 text-right font-mono">
                              {item.aei === null ? "—" : item.aei}
                            </td>
                            <td className="px-4 py-3 text-right font-mono">
                              {item.trendReturn}
                            </td>
                            <td className="px-4 py-3 text-right font-mono">
                              {item.trendRisk}
                            </td>
                            <td className="px-4 py-3 text-right font-mono">
                              {item.trendRatio}
                            </td>
                            <td className="px-4 py-3 text-right font-mono">
                              {item.roi.toFixed(6)}
                            </td>
                            <td className="px-4 py-3 text-right font-mono">
                              {item.mdd.toFixed(6)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>

            <div className="mt-7 border-t border-border pt-7">
              <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">績效 × 回撤</p>
                  <h2 className="mt-1 text-xl font-semibold">ROI–MDD 比較圖</h2>
                </div>
                <label className="min-w-[280px] flex-1 sm:max-w-xl">
                  <span className="mb-1.5 block text-sm font-semibold">圖表標題</span>
                  <input
                    type="text"
                    value={roiMddChartTitle}
                    onChange={(event) => setRoiMddChartTitle(event.target.value)}
                    placeholder="ROI and MDD across Training Days"
                    className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                  />
                </label>
                <button
                  onClick={downloadRoiMddChart}
                  disabled={!comparisonData.length}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Download size={16} />下載 PNG
                </button>
              </div>
              {comparisonData.length === 0 ? (
                <div className="flex min-h-52 items-center justify-center rounded-xl border border-dashed border-border bg-muted/35 px-6 text-center text-sm text-muted-foreground">
                  請勾選表格中的檔案，即可比較不同訓練天數的 ROI 與 MDD。
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-border bg-white p-3 sm:p-6">
                  <div ref={roiMddChartRef} className="h-[430px] min-w-[660px] font-serif">
                    <h3 className="mb-2 text-center text-lg font-bold text-slate-900 sm:text-xl">
                      {displayedRoiMddTitle}
                    </h3>
                    <ResponsiveContainer width="100%" height="92%">
                      <LineChart data={comparisonData} margin={{ top: 18, right: 32, left: 32, bottom: 20 }}>
                        <CartesianGrid stroke="#d8dee4" strokeDasharray="3 3" vertical={false} />
                        <XAxis
                          dataKey="label"
                          tick={{ fill: "#334155", fontSize: 13, fontWeight: 700, fontFamily: "Times New Roman" }}
                          axisLine={{ stroke: "#64748b" }}
                          tickLine={false}
                          label={{ value: "Strategies", position: "insideBottom", offset: -10, fill: "#0f172a", fontWeight: 700, fontFamily: "Times New Roman" }}
                        />
                        <YAxis
                          yAxisId="roi"
                          orientation="left"
                          tickMargin={12}
                          tickFormatter={(value) => `${Number(value).toFixed(1)}%`}
                          tick={{ fill: "#087f73", fontSize: 12, fontWeight: 700, fontFamily: "Times New Roman" }}
                          axisLine={false}
                          tickLine={false}
                          width={82}
                          label={{ value: "ROI (%)", angle: -90, position: "insideLeft", offset: 8, fill: "#087f73", fontWeight: 700, fontFamily: "Times New Roman" }}
                        />
                        <YAxis
                          yAxisId="mdd"
                          orientation="right"
                          tickMargin={12}
                          tickFormatter={(value) => `${Number(value).toFixed(1)}%`}
                          tick={{ fill: "#dc2626", fontSize: 12, fontWeight: 700, fontFamily: "Times New Roman" }}
                          axisLine={false}
                          tickLine={false}
                          width={82}
                          label={{ value: "MDD (%)", angle: 90, position: "insideRight", offset: 8, fill: "#dc2626", fontWeight: 700, fontFamily: "Times New Roman" }}
                        />
                        <Tooltip
                          formatter={(value, name) => [`${Number(value).toFixed(2)}%`, name]}
                          labelFormatter={(label) => `Strategy: ${label}`}
                          contentStyle={{ borderRadius: 10, borderColor: "#cbd5e1", boxShadow: "0 8px 24px rgba(15,23,42,.12)", fontFamily: "Times New Roman", fontWeight: 700 }}
                        />
                        <Legend verticalAlign="top" align="right" iconType="line" wrapperStyle={{ paddingBottom: 14, fontFamily: "Times New Roman", fontWeight: 700 }} />
                        <Line yAxisId="roi" type="linear" dataKey="roi" name="ROI" stroke="#087f73" strokeWidth={2.5} dot={{ r: 4, fill: "#087f73", strokeWidth: 0 }} activeDot={{ r: 6 }} />
                        <Line yAxisId="mdd" type="linear" dataKey="mdd" name="MDD" stroke="#dc2626" strokeWidth={2.5} dot={{ r: 4, fill: "#dc2626", strokeWidth: 0 }} activeDot={{ r: 6 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="mt-2 text-center text-xs text-slate-500">
                    ROI 使用首末資金水位計算；MDD 為整段資料中的最大峰值回撤。
                  </p>
                </div>
              )}
            </div>
          </section>
        )}

      </div>
    </main>
  );
}

function EmptyState() {
  return (
    <div className="flex min-h-[390px] flex-col items-center justify-center text-center text-muted-foreground">
      <div className="mb-5 flex size-16 items-center justify-center rounded-2xl bg-muted">
        <FileSpreadsheet size={28} />
      </div>
      <p className="font-medium text-foreground">尚未載入資料</p>
      <p className="mt-2 max-w-sm text-sm leading-6">
        一次選取多個 CSV 後，結果比較表與資金趨勢圖會顯示在這裡。
      </p>
    </div>
  );
}
function DayBadge({ days }: { days: number }) {
  const ok = days === EXPECTED_DAYS;
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium ${ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}
    >
      {ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}共{" "}
      {days.toLocaleString()} 筆
    </div>
  );
}
function MetricCard({
  label,
  value,
  unit,
  tone,
}: {
  label: string;
  value: string;
  unit: string;
  tone?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${tone ? "border-primary/20 bg-primary/5" : "border-border bg-background"}`}
    >
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="mt-2 break-all font-mono text-xl font-semibold sm:text-2xl">
        {value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{unit}</p>
    </div>
  );
}
function DataItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono font-medium">{value}</p>
    </div>
  );
}
function Formula({ title, formula }: { title: string; formula: string }) {
  return (
    <article className="rounded-xl bg-muted p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-3 overflow-x-auto whitespace-nowrap font-mono text-sm text-primary">
        {formula}
      </p>
    </article>
  );
}

function FormulaStep({
  number,
  title,
  equation,
  description,
}: {
  number: string;
  title: string;
  equation: string;
  description: string;
}) {
  return (
    <article className="rounded-xl border border-border bg-background p-5">
      <div className="flex items-center gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
          {number}
        </span>
        <h3 className="font-semibold">{title}</h3>
      </div>
      <p className="mt-4 overflow-x-auto whitespace-nowrap rounded-lg bg-muted px-4 py-3 text-center font-serif text-base font-bold text-primary sm:text-lg">
        {equation}
      </p>
      <p className="mt-4 text-sm leading-6 text-muted-foreground">{description}</p>
    </article>
  );
}
