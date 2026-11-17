import path from "node:path";
import { Document, Font, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { SheetLayout } from "@/features/selection/client";

const assets = path.join(process.cwd(), "src/assets");

Font.register({
  family: "Instrument Serif",
  src: path.join(assets, "fonts/instrument-serif-latin-400-normal.woff"),
});
Font.register({
  family: "Inter Tight",
  fonts: [
    { src: path.join(assets, "fonts/inter-tight-latin-400-normal.woff"), fontWeight: 400 },
    { src: path.join(assets, "fonts/inter-tight-latin-600-normal.woff"), fontWeight: 600 },
  ],
});

// Theme tokens from SPEC → Look and feel (light).
const color = {
  background: "#F5F4F0",
  card: "#FFFFFF",
  text: "#111111",
  muted: "#66645D",
  line: "#EBE9E3",
  gold: "#F2C400",
  navy: "#1F2F55",
};

const styles = StyleSheet.create({
  page: { padding: 20, fontSize: 10, fontFamily: "Inter Tight", color: color.text, backgroundColor: color.background },
  card: { backgroundColor: color.card, borderRadius: 16, padding: 22 },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  heading: { flex: 1, paddingRight: 16 },
  title: { fontFamily: "Instrument Serif", fontSize: 24, lineHeight: 1.1 },
  date: { fontSize: 10, marginTop: 2, color: color.muted },
  crest: { width: 38, height: 38, borderRadius: 19, borderWidth: 0.5, borderColor: color.line },
  details: { flexDirection: "row", flexWrap: "wrap", marginTop: 12, borderRadius: 10, backgroundColor: color.background, paddingVertical: 6, paddingHorizontal: 12 },
  detail: { marginRight: 24, paddingVertical: 1 },
  label: { fontSize: 7, letterSpacing: 0.8, textTransform: "uppercase", color: color.muted },
  value: { fontSize: 10, fontWeight: 600, marginTop: 1 },
  header: { flexDirection: "row", marginTop: 12, paddingBottom: 4, borderBottomWidth: 1, borderColor: color.text, fontSize: 7, letterSpacing: 0.8, textTransform: "uppercase", color: color.muted },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 2.5, borderBottomWidth: 0.5, borderColor: color.line },
  number: { width: 32 },
  shirt: { width: 16, height: 16, borderRadius: 8, backgroundColor: color.background, textAlign: "center", paddingTop: 3.5, fontSize: 8, fontWeight: 600 },
  name: { flex: 1, fontSize: 10 },
  roles: { width: 80 },
  role: { alignSelf: "flex-start", backgroundColor: color.gold, color: color.text, borderRadius: 6, paddingVertical: 1, paddingHorizontal: 6, fontSize: 8, fontWeight: 600 },
  legend: { marginTop: 10, fontSize: 7.5, lineHeight: 1.4, color: color.muted },
});

/** The Team Sheet, drawn from the same layout as the on-screen preview (ADR 0005). */
function TeamSheetDocument({ sheet }: { sheet: SheetLayout }) {
  return (
    <Document title={sheet.title}>
      <Page size="A4" style={styles.page}>
        <View style={styles.card}>
          <View style={styles.top}>
            <View style={styles.heading}>
              <Text style={styles.title}>{sheet.title}</Text>
              <Text style={styles.date}>{sheet.date}</Text>
            </View>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt */}
            <Image src={path.join(process.cwd(), "docs/brand/crest.png")} style={styles.crest} />
          </View>
          <View style={styles.details}>
            {sheet.details.map((d) => (
              <View key={d.label} style={styles.detail} wrap={false}>
                <Text style={styles.label}>{d.label}</Text>
                <Text style={styles.value}>{d.value}</Text>
              </View>
            ))}
          </View>
          {sheet.sections.map((section) => (
            <View key={section.title}>
              <View style={styles.header}>
                <Text style={styles.number}>No.</Text>
                <Text style={styles.name}>{section.title}</Text>
                <Text style={styles.roles}>Role</Text>
              </View>
              {section.rows.map((r) => (
                <View key={r.shirt} style={styles.row} wrap={false}>
                  <View style={styles.number}>
                    <Text style={styles.shirt}>{r.shirt}</Text>
                  </View>
                  <Text style={styles.name}>{r.name}</Text>
                  <View style={styles.roles}>{r.roles ? <Text style={styles.role}>{r.roles}</Text> : null}</View>
                </View>
              ))}
            </View>
          ))}
          <Text style={styles.legend}>{sheet.legend}</Text>
        </View>
      </Page>
    </Document>
  );
}

export const renderTeamSheetPdf = (sheet: SheetLayout) => renderToBuffer(<TeamSheetDocument sheet={sheet} />);

/** A team sheet as a downloadable PDF response, named "<title> <date>". */
export async function pdfResponse(layout: SheetLayout, date: string): Promise<Response> {
  const filename = `${layout.title} ${date}`.replace(/[^\w ]+/g, "").trim().replace(/ +/g, "-");
  return new Response(new Uint8Array(await renderTeamSheetPdf(layout)), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}.pdf"`, "Cache-Control": "private, no-store" },
  });
}
