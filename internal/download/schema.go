package download

// Download-owned bridge table schema descriptors are declared in the dbschema sub-package
// (internal/download/dbschema) to avoid an import cycle: the download package's in-package
// test files import internal/sync, and internal/sync aggregates the full schema set at
// bootstrap time. Keeping the descriptors in a dependency-free sub-package breaks that cycle
// while preserving bounded-context ownership of the table definitions.
