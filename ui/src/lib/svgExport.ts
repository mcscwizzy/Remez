export type SvgExportResult = {
  ok: boolean;
  error?: string;
};

const REQUIRED_ERROR = "Rendered SVG not found.";

const ensureSvgAttributes = (source: string, width: number | null, height: number | null): string => {
  let updated = source.trimStart();

  const needsXmlns = !updated.includes("xmlns=");
  const needsViewBox = !updated.includes("viewBox=") && width !== null && height !== null;

  if (!needsXmlns && !needsViewBox) return updated;

  const attrs: string[] = [];
  if (needsXmlns) attrs.push('xmlns="http://www.w3.org/2000/svg"');
  if (needsViewBox) attrs.push(`viewBox="0 0 ${width} ${height}"`);

  updated = updated.replace(/^<svg\b/, `<svg ${attrs.join(" ")}`);
  return updated;
};

export function exportSvgFromContainer(container: HTMLDivElement, filename: string): SvgExportResult {
  const svg = container.querySelector("svg");
  if (!svg) {
    window.alert(REQUIRED_ERROR);
    return { ok: false, error: REQUIRED_ERROR };
  }

  const serializer = new XMLSerializer();
  let source = serializer.serializeToString(svg).trimStart();

  if (!source.startsWith("<svg") || !source.includes("</svg>")) {
    window.alert(REQUIRED_ERROR);
    return { ok: false, error: REQUIRED_ERROR };
  }

  const widthAttr = svg.getAttribute("width");
  const heightAttr = svg.getAttribute("height");
  const width = widthAttr ? Number.parseFloat(widthAttr) : null;
  const height = heightAttr ? Number.parseFloat(heightAttr) : null;
  const widthOk = Number.isFinite(width ?? NaN) ? width! : null;
  const heightOk = Number.isFinite(height ?? NaN) ? height! : null;

  source = ensureSvgAttributes(source, widthOk, heightOk);

  if (source.length < 200) {
    const error = "SVG export failed: output too small.";
    window.alert(error);
    return { ok: false, error };
  }

  console.log("SVG length:", source.length);

  const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);

  return { ok: true };
}
