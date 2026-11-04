import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { severityLabel, type SeverityLevel } from "@/lib/logs";

/**
 * Génération du PDF « Bilan SOC ».
 * La charte impose 5 couleurs : on les utilise en RGB.
 * Le bandeau de titre, les accents de section et les entêtes de tableau
 * reposent sur #222526 / #353A3E, le papier sur #FFFFFF, les séparateurs
 * sur #E0E0E0. Le texte est justifié pour les paragraphes.
 */
const INK: [number, number, number] = [34, 37, 38]; // #222526
const SLATE: [number, number, number] = [53, 58, 62]; // #353A3E
const MIST: [number, number, number] = [224, 224, 224]; // #E0E0E0
const PAPER: [number, number, number] = [255, 255, 255]; // #FFFFFF

export interface PdfReport {
  id: string;
  name: string;
  period: string;
  createdAt: string;
  sections: {
    summary: boolean;
    anomalies: boolean;
    sources: boolean;
    recommendations: boolean;
  };
  summary: {
    totalOccurrences: number;
    previousOccurrences: number;
    signatures: number;
    sources: number;
    treatmentRate: number | null;
    pending: number;
  };
  anomalies: {
    name: string;
    category: string;
    occurrences: number;
    previous: number;
    severity: SeverityLevel | null;
    source: string;
    lastSeen: string;
  }[];
  sources: { source: string; count: number }[];
  recommendations: string[];
}

// Les polices standard de jsPDF ne savent pas rendre l'espace fine insécable
// (U+202F) produite par Intl en français : on la remplace par une espace.
function normalizeSpaces(value: string) {
  return value.replace(/[  ]/g, " ");
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : normalizeSpaces(date.toLocaleString("fr-FR"));
}

function formatNumber(value: number) {
  return normalizeSpaces(new Intl.NumberFormat("fr-FR").format(value));
}

export function generateReportPdf(report: PdfReport) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  const reportName = normalizeSpaces(report.name);
  const reportPeriod = normalizeSpaces(report.period);

  doc.setProperties({
    title: reportName,
    subject: "Bilan SOC SentineDog-SeeYou",
    author: "SeeYou",
    creator: "SentineDog-SeeYou",
  });

  /* ---------- Bandeau de titre ---------- */
  doc.setFillColor(...INK);
  doc.rect(0, 0, pageWidth, 34, "F");

  doc.setTextColor(...PAPER);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("SeeYou · Bilan SOC", margin, 15);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("SENTINEDOG SOC · RAPPORT D'ACTIVITÉ", margin, 21);

  doc.setFontSize(9);
  doc.text(report.id, pageWidth - margin, 15, { align: "right" });
  doc.text(normalizeSpaces(report.createdAt), pageWidth - margin, 21, {
    align: "right",
  });

  /* ---------- Titre du rapport ---------- */
  let y = 46;
  doc.setFillColor(...SLATE);
  doc.rect(margin, y - 5, 2.5, 2.5, "F");

  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  const titleLines = doc.splitTextToSize(reportName, contentWidth - 6);
  doc.text(titleLines, margin + 5, y);
  y += titleLines.length * 6.5 + 4;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...SLATE);
  doc.text(`Période : ${reportPeriod}`, margin, y);
  y += 5;

  doc.setFontSize(9);
  doc.text(
    "Ce bilan synthétise les alertes chargées par la console SentineDog-SeeYou et le flux temps réel. Les montants et pourcentages sont calculés sur cette base ; aucune valeur n'est simulée.",
    margin,
    y,
    { maxWidth: contentWidth, align: "justify" },
  );
  y += 12;

  doc.setDrawColor(...MIST);
  doc.setLineWidth(0.6);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  const ensureSpace = (needed: number) => {
    if (y + needed <= pageHeight - 22) return;
    doc.addPage();
    y = 24;
  };

  const sectionTitle = (title: string) => {
    ensureSpace(14);
    doc.setFillColor(...INK);
    doc.rect(margin, y - 4, 2, 4, "F");
    doc.setTextColor(...INK);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(title.toUpperCase(), margin + 5, y);
    y += 7;
  };

  const change =
    report.summary.previousOccurrences > 0
      ? Math.round(
          ((report.summary.totalOccurrences -
            report.summary.previousOccurrences) /
            report.summary.previousOccurrences) *
            100,
        )
      : null;
  const changeNote =
    change === null
      ? "Période précédente indisponible"
      : `${change >= 0 ? "+" : ""}${change} % vs période précédente`;

  /* ---------- Résumé ---------- */
  if (report.sections.summary) {
    sectionTitle("Résumé");
    const cards: [string, string, string][] = [
      [
        "Anomalies récurrentes",
        formatNumber(report.summary.totalOccurrences),
        changeNote,
      ],
      [
        "Signatures distinctes",
        formatNumber(report.summary.signatures),
        "Types d'alerte distincts",
      ],
      [
        "Sources concernées",
        formatNumber(report.summary.sources),
        "Adresses source distinctes",
      ],
      [
        "Taux de traitement",
        report.summary.treatmentRate === null
          ? "—"
          : `${report.summary.treatmentRate} %`,
        "Alertes bloquées ou validées",
      ],
    ];
    const cardWidth = (contentWidth - 6) / 2;
    const cardHeight = 23;

    ensureSpace(2 * cardHeight + 6);
    cards.forEach(([label, value, note], index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      const x = margin + col * (cardWidth + 6);
      const cy = y + row * (cardHeight + 4);

      doc.setDrawColor(...MIST);
      doc.setFillColor(...PAPER);
      doc.roundedRect(x, cy, cardWidth, cardHeight, 1.5, 1.5, "FD");

      doc.setTextColor(...SLATE);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.text(label.toUpperCase(), x + 4, cy + 7);

      doc.setTextColor(...INK);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text(value, x + 4, cy + 15);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(...SLATE);
      const noteLines = doc.splitTextToSize(note, cardWidth - 8);
      doc.text(noteLines[0] ?? "", x + 4, cy + 20);
    });
    y += 2 * cardHeight + 8;
  }

  /* ---------- Anomalies ---------- */
  if (report.sections.anomalies) {
    sectionTitle("Anomalies récurrentes");
    ensureSpace(22);
    if (report.anomalies.length === 0) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(9);
      doc.setTextColor(...SLATE);
      doc.text("Aucune anomalie sur la période sélectionnée.", margin, y);
      y += 8;
    } else {
      autoTable(doc, {
        startY: y,
        margin: { top: 20, right: margin, bottom: 18, left: margin },
        head: [
          [
            "Type",
            "Catégorie",
            "Occ.",
            "Préc.",
            "Sévérité",
            "Source",
            "Dernière obs.",
          ],
        ],
        body: report.anomalies.map((anomaly) => [
          anomaly.name,
          anomaly.category,
          formatNumber(anomaly.occurrences),
          formatNumber(anomaly.previous),
          severityLabel(anomaly.severity),
          anomaly.source,
          formatDate(anomaly.lastSeen),
        ]),
        theme: "grid",
        styles: {
          font: "helvetica",
          fontSize: 7.6,
          cellPadding: 2.2,
          textColor: INK,
          lineColor: MIST,
          lineWidth: 0.2,
        },
        headStyles: {
          fillColor: INK,
          textColor: PAPER,
          fontStyle: "bold",
          fontSize: 7.6,
        },
        alternateRowStyles: { fillColor: MIST },
        columnStyles: {
          2: { halign: "right" },
          3: { halign: "right" },
        },
      });
      const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } })
        .lastAutoTable?.finalY;
      y = (finalY ?? y) + 8;
    }
  }

  /* ---------- Sources ---------- */
  if (report.sections.sources) {
    sectionTitle("Sources concernées");
    ensureSpace(22);
    if (report.sources.length === 0) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(9);
      doc.setTextColor(...SLATE);
      doc.text("Aucune source sur la période sélectionnée.", margin, y);
      y += 8;
    } else {
      autoTable(doc, {
        startY: y,
        margin: { top: 20, right: margin, bottom: 18, left: margin },
        head: [["Adresse source", "Alertes"]],
        body: report.sources.map((source) => [
          source.source,
          formatNumber(source.count),
        ]),
        theme: "grid",
        styles: {
          font: "helvetica",
          fontSize: 8,
          cellPadding: 2.2,
          textColor: INK,
          lineColor: MIST,
          lineWidth: 0.2,
        },
        headStyles: {
          fillColor: INK,
          textColor: PAPER,
          fontStyle: "bold",
          fontSize: 8,
        },
        alternateRowStyles: { fillColor: MIST },
        columnStyles: { 1: { halign: "right" } },
      });
      const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } })
        .lastAutoTable?.finalY;
      y = (finalY ?? y) + 8;
    }
  }

  /* ---------- Recommandations ---------- */
  if (report.sections.recommendations) {
    sectionTitle("Recommandations");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...INK);
    report.recommendations.forEach((recommendation, index) => {
      const text = `${index + 1}. ${recommendation}`;
      const lines = doc.splitTextToSize(text, contentWidth - 4);
      ensureSpace(lines.length * 4.6 + 3);
      doc.text(text, margin, y, {
        maxWidth: contentWidth - 4,
        align: "justify",
      });
      y += lines.length * 4.6 + 2.5;
    });
  }

  /* ---------- Pieds de page ---------- */
  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);

    if (page > 1) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...SLATE);
      doc.text(`SeeYou · ${reportName}`, margin, 12);
      doc.setDrawColor(...MIST);
      doc.setLineWidth(0.4);
      doc.line(margin, 15, pageWidth - margin, 15);
    }

    doc.setDrawColor(...MIST);
    doc.setLineWidth(0.4);
    doc.line(margin, pageHeight - 16, pageWidth - margin, pageHeight - 16);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...SLATE);
    doc.text("SeeYou · Bilan SOC", margin, pageHeight - 10);
    doc.text(report.id, pageWidth / 2, pageHeight - 10, { align: "center" });
    doc.text(
      `Page ${page} / ${totalPages}`,
      pageWidth - margin,
      pageHeight - 10,
      {
        align: "right",
      },
    );
  }

  doc.save(`SeeYou-Bilan-${report.id}.pdf`);
}
