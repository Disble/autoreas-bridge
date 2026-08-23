package centerschema

import "testing"

// TestSchemaTablesReturnsNotificationRecordsAndActionsDescriptors asserts
// SchemaTables returns exactly the two notification-center-owned table
// descriptors, in the exact order the DDL declares them -- a source-level pin
// so this leaf package's shape changes only deliberately.
func TestSchemaTablesReturnsNotificationRecordsAndActionsDescriptors(t *testing.T) {
	t.Parallel()

	tables := SchemaTables()

	if len(tables) != 2 {
		t.Fatalf("expected exactly 2 table descriptors, got %d", len(tables))
	}

	want := []string{"notification_records", "notification_record_actions"}
	for i, name := range want {
		if tables[i].Name != name {
			t.Fatalf("expected table %d to be named %q, got %q", i, name, tables[i].Name)
		}
	}
}
