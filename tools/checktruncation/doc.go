// Command checktruncation reports committed anime writes that silently emptied
// a collection field. It reads only data already persisted at commit time
// (anime_write_operations base/desired snapshot pairs) and adds no runtime
// instrumentation. Its output is the recovery list. See SDD-64.
package main
