export namespace contracts {
	
	export class AnimeLegacyPullResult {
	    status: string;
	    message: string;
	    updatedCount: number;
	    prunedCount: number;
	    warningCount: number;
	
	    static createFrom(source: any = {}) {
	        return new AnimeLegacyPullResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.status = source["status"];
	        this.message = source["message"];
	        this.updatedCount = source["updatedCount"];
	        this.prunedCount = source["prunedCount"];
	        this.warningCount = source["warningCount"];
	    }
	}
	export class AnimeListItem {
	    id: string;
	    nombre: string;
	    estado: number;
	    nrocapvisto: number;
	    totalcap?: number;
	    activo: number;
	    tipo?: number;
	    dias: string[];
	    generos: string[];
	    hasDownloadPage: boolean;
	    hasFolder: boolean;
	
	    static createFrom(source: any = {}) {
	        return new AnimeListItem(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.nombre = source["nombre"];
	        this.estado = source["estado"];
	        this.nrocapvisto = source["nrocapvisto"];
	        this.totalcap = source["totalcap"];
	        this.activo = source["activo"];
	        this.tipo = source["tipo"];
	        this.dias = source["dias"];
	        this.generos = source["generos"];
	        this.hasDownloadPage = source["hasDownloadPage"];
	        this.hasFolder = source["hasFolder"];
	    }
	}
	export class ChapterCommandResult {
	    status: string;
	    message?: string;
	    animeId?: string;
	    animeName?: string;
	    estado?: number;
	    nrocapvisto?: number;
	    occurredAtMs?: number;
	    correlationId?: string;

	    static createFrom(source: any = {}) {
	        return new ChapterCommandResult(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.status = source["status"];
	        this.message = source["message"];
	        this.animeId = source["animeId"];
	        this.animeName = source["animeName"];
	        this.estado = source["estado"];
	        this.nrocapvisto = source["nrocapvisto"];
	        this.occurredAtMs = source["occurredAtMs"];
	        this.correlationId = source["correlationId"];
	    }
	}
	export class ChapterScheduleItem {
	    animeId: string;
	    animeName: string;
	    estado: number;
	    nrocapvisto: number;
	    totalcap?: number;
	    day: string;
	    dayOrder: number;
	    modified_at: number;
	    hasPage: boolean;
	    hasFolder: boolean;
	    lastWatched?: number;
	    firstWatched?: number;

	    static createFrom(source: any = {}) {
	        return new ChapterScheduleItem(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.animeId = source["animeId"];
	        this.animeName = source["animeName"];
	        this.estado = source["estado"];
	        this.nrocapvisto = source["nrocapvisto"];
	        this.totalcap = source["totalcap"];
	        this.day = source["day"];
	        this.dayOrder = source["dayOrder"];
	        this.modified_at = source["modified_at"];
	        this.hasPage = source["hasPage"];
	        this.hasFolder = source["hasFolder"];
	        this.lastWatched = source["lastWatched"];
	        this.firstWatched = source["firstWatched"];
	    }
	}
	export class DeviceInfo {
	    device_id: string;
	    device_name: string;
	    paired_at_ms: number;
	    last_seen_at_ms: number;
	    last_ack_changelog_id: number;
	    sync_status: string;
	    connection_status: string;
	    auth_state: string;
	    blocks_changelog_pruning: boolean;
	
	    static createFrom(source: any = {}) {
	        return new DeviceInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.device_id = source["device_id"];
	        this.device_name = source["device_name"];
	        this.paired_at_ms = source["paired_at_ms"];
	        this.last_seen_at_ms = source["last_seen_at_ms"];
	        this.last_ack_changelog_id = source["last_ack_changelog_id"];
	        this.sync_status = source["sync_status"];
	        this.connection_status = source["connection_status"];
	        this.auth_state = source["auth_state"];
	        this.blocks_changelog_pruning = source["blocks_changelog_pruning"];
	    }
	}
	export class HosterPriorityItem {
	    hoster: string;
	    priority: number;
	    enabled: boolean;
	
	    static createFrom(source: any = {}) {
	        return new HosterPriorityItem(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.hoster = source["hoster"];
	        this.priority = source["priority"];
	        this.enabled = source["enabled"];
	    }
	}
	export class ScheduleConfig {
	    mode: string;
	    dailyTimeHHMM: string;
	    enabled: boolean;
	    lastRunAtMs: number;
	    lastRunStatus: string;
	    nextRunAtMs: number;
	    running: boolean;
	    enabledWeekdays: number;
	
	    static createFrom(source: any = {}) {
	        return new ScheduleConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.mode = source["mode"];
	        this.dailyTimeHHMM = source["dailyTimeHHMM"];
	        this.enabled = source["enabled"];
	        this.lastRunAtMs = source["lastRunAtMs"];
	        this.lastRunStatus = source["lastRunStatus"];
	        this.nextRunAtMs = source["nextRunAtMs"];
	        this.running = source["running"];
	        this.enabledWeekdays = source["enabledWeekdays"];
	    }
	}
	export class JDStatus {
	    email: string;
	    hasPassword: boolean;
	    deviceName: string;
	    exePathOverride: string;
	    defaultDestDir: string;
	    lastSeenStatus: string;
	    lastSeenAtMs: number;
	    lastDecryptError?: string;
	
	    static createFrom(source: any = {}) {
	        return new JDStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.email = source["email"];
	        this.hasPassword = source["hasPassword"];
	        this.deviceName = source["deviceName"];
	        this.exePathOverride = source["exePathOverride"];
	        this.defaultDestDir = source["defaultDestDir"];
	        this.lastSeenStatus = source["lastSeenStatus"];
	        this.lastSeenAtMs = source["lastSeenAtMs"];
	        this.lastDecryptError = source["lastDecryptError"];
	    }
	}
	export class DownloadConfig {
	    jd: JDStatus;
	    schedule: ScheduleConfig;
	    hosterPriority: HosterPriorityItem[];
	
	    static createFrom(source: any = {}) {
	        return new DownloadConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.jd = this.convertValues(source["jd"], JDStatus);
	        this.schedule = this.convertValues(source["schedule"], ScheduleConfig);
	        this.hosterPriority = this.convertValues(source["hosterPriority"], HosterPriorityItem);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ManualLink {
	    anime: string;
	    episode: number;
	    links: string[];
	
	    static createFrom(source: any = {}) {
	        return new ManualLink(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.anime = source["anime"];
	        this.episode = source["episode"];
	        this.links = source["links"];
	    }
	}
	export class DownloadRunView {
	    runId: string;
	    startedAtMs: number;
	    finishedAtMs?: number;
	    trigger: string;
	    animesChecked: number;
	    episodesFound: number;
	    episodesDownloaded: number;
	    episodesFailed: number;
	    skippedCount: number;
	    jdAvailable: boolean;
	    status: string;
	    errorSummary?: string;
	    manualLinks?: ManualLink[];
	
	    static createFrom(source: any = {}) {
	        return new DownloadRunView(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.runId = source["runId"];
	        this.startedAtMs = source["startedAtMs"];
	        this.finishedAtMs = source["finishedAtMs"];
	        this.trigger = source["trigger"];
	        this.animesChecked = source["animesChecked"];
	        this.episodesFound = source["episodesFound"];
	        this.episodesDownloaded = source["episodesDownloaded"];
	        this.episodesFailed = source["episodesFailed"];
	        this.skippedCount = source["skippedCount"];
	        this.jdAvailable = source["jdAvailable"];
	        this.status = source["status"];
	        this.errorSummary = source["errorSummary"];
	        this.manualLinks = this.convertValues(source["manualLinks"], ManualLink);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class JDConfigInput {
	    email: string;
	    plaintextPassword?: string;
	    deviceName: string;
	    exePathOverride: string;
	    defaultDestDir: string;
	
	    static createFrom(source: any = {}) {
	        return new JDConfigInput(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.email = source["email"];
	        this.plaintextPassword = source["plaintextPassword"];
	        this.deviceName = source["deviceName"];
	        this.exePathOverride = source["exePathOverride"];
	        this.defaultDestDir = source["defaultDestDir"];
	    }
	}
	
	
	
	export class SyncingAnimeItem {
	    animeId: string;
	    title: string;
	    changeType: string;
	    pendingChanges: number;
	    changedFields: string[];
	    progressCurrent?: number;
	    progressTotal?: number;
	    lastChangedAtMs: number;
	    activo: number;
	
	    static createFrom(source: any = {}) {
	        return new SyncingAnimeItem(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.animeId = source["animeId"];
	        this.title = source["title"];
	        this.changeType = source["changeType"];
	        this.pendingChanges = source["pendingChanges"];
	        this.changedFields = source["changedFields"];
	        this.progressCurrent = source["progressCurrent"];
	        this.progressTotal = source["progressTotal"];
	        this.lastChangedAtMs = source["lastChangedAtMs"];
	        this.activo = source["activo"];
	    }
	}

}

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
