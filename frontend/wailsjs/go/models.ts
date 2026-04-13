export namespace logger {
	
	export class LogEntry {
	    timestamp: string;
	    domain: string;
	    level?: string;
	    message: string;
	    correlationId?: string;
	    entityId?: string;
	    eventType?: string;
	    durationMs?: number;
	    metadata?: Record<string, any>;
	
	    static createFrom(source: any = {}) {
	        return new LogEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.timestamp = source["timestamp"];
	        this.domain = source["domain"];
	        this.level = source["level"];
	        this.message = source["message"];
	        this.correlationId = source["correlationId"];
	        this.entityId = source["entityId"];
	        this.eventType = source["eventType"];
	        this.durationMs = source["durationMs"];
	        this.metadata = source["metadata"];
	    }
	}

}

