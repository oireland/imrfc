import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { SheetLayout } from "@/features/selection/sheet";

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 11, fontFamily: "Helvetica", color: "#111" },
  title: { fontSize: 20, fontFamily: "Helvetica-Bold" },
  date: { fontSize: 12, marginTop: 2, marginBottom: 14, color: "#555" },
  detail: { flexDirection: "row", marginBottom: 3 },
  label: { width: 110, fontFamily: "Helvetica-Bold" },
  value: { flex: 1 },
  message: { marginTop: 10, marginBottom: 14, lineHeight: 1.4 },
  header: { flexDirection: "row", borderBottomWidth: 1, borderColor: "#111", paddingBottom: 4, marginBottom: 4, fontFamily: "Helvetica-Bold" },
  row: { flexDirection: "row", paddingVertical: 3, borderBottomWidth: 0.5, borderColor: "#ccc" },
  number: { width: 40 },
  name: { flex: 1 },
  roles: { width: 90 },
  legend: { marginTop: 14, fontSize: 9, color: "#555" },
});

/** The Team Sheet, drawn from the same layout as the on-screen preview (ADR 0005). */
function TeamSheetDocument({ sheet }: { sheet: SheetLayout }) {
  return (
    <Document title={sheet.title}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{sheet.title}</Text>
        <Text style={styles.date}>{sheet.date}</Text>
        {sheet.details.map((d) => (
          <View key={d.label} style={styles.detail} wrap={false}>
            <Text style={styles.label}>{d.label}</Text>
            <Text style={styles.value}>{d.value}</Text>
          </View>
        ))}
        {sheet.message ? <Text style={styles.message}>{sheet.message}</Text> : null}
        <View style={styles.header}>
          <Text style={styles.number}>No.</Text>
          <Text style={styles.name}>Name</Text>
          <Text style={styles.roles}>Role</Text>
        </View>
        {sheet.rows.map((r) => (
          <View key={r.shirt} style={styles.row} wrap={false}>
            <Text style={styles.number}>{r.shirt}</Text>
            <Text style={styles.name}>{r.name}</Text>
            <Text style={styles.roles}>{r.roles}</Text>
          </View>
        ))}
        <Text style={styles.legend}>{sheet.legend}</Text>
      </Page>
    </Document>
  );
}

export const renderTeamSheetPdf = (sheet: SheetLayout) => renderToBuffer(<TeamSheetDocument sheet={sheet} />);
