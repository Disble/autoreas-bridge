export namespace contracts {
	
	export class AnimeHistoryItem {
	    id: string;
	    nombre: string;
	    nrocapvisto: number;
	    fechaUltCapVisto: number;
	    estado: number;
	    tipo?: number;
	    fechaCreacion?: number;
	
	    static createFrom(source: any = {}) {
	        return new AnimeHistoryItem(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.nombre = source["nombre"];
	        this.nrocapvisto = source["nrocapvisto"];
	        this.fechaUltCapVisto = source["fechaUltCapVisto"];
	        this.estado = source["estado"];
	        this.tipo = source["tipo"];
	        this.fechaCreacion = source["fechaCreacion"];
	    }
	}
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
	    upToDateCount: number;
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
	        this.upToDateCount = source["upToDateCount"];
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
	
	
	export class MobileRepeticion {
	    numrepeticion: number;
	    nrocapvisto: number;
	    estado: number;
	    fechaCreacion?: number;
	    fechaEstreno?: number;
	    fechaUltCapVisto?: number;
	    fechaEliminacion?: number;
	    fechaRepeticion?: number;
	
	    static createFrom(source: any = {}) {
	        return new MobileRepeticion(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.numrepeticion = source["numrepeticion"];
	        this.nrocapvisto = source["nrocapvisto"];
	        this.estado = source["estado"];
	        this.fechaCreacion = source["fechaCreacion"];
	        this.fechaEstreno = source["fechaEstreno"];
	        this.fechaUltCapVisto = source["fechaUltCapVisto"];
	        this.fechaEliminacion = source["fechaEliminacion"];
	        this.fechaRepeticion = source["fechaRepeticion"];
	    }
	}
	export class MobileAnimeDay {
	    dia: string;
	    orden: number;
	
	    static createFrom(source: any = {}) {
	        return new MobileAnimeDay(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.dia = source["dia"];
	        this.orden = source["orden"];
	    }
	}
	export class MobileAnime {
	    _id: string;
	    nombre: string;
	    estado: number;
	    nrocapvisto: number;
	    totalcap?: number;
	    activo: number;
	    primeravez: number;
	    dias: MobileAnimeDay[];
	    generos: string[];
	    tipo?: number;
	    fechaUltCapVisto?: number;
	    fechaEstreno?: number;
	    fechaCreacion?: number;
	    fechaEliminacion?: number;
	    portada?: string;
	    pagina?: string;
	    carpeta?: string;
	    estudios?: string;
	    origen?: string;
	    duracion?: number;
	    repetir?: MobileRepeticion[];
	    modified_at: number;
	
	    static createFrom(source: any = {}) {
	        return new MobileAnime(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this._id = source["_id"];
	        this.nombre = source["nombre"];
	        this.estado = source["estado"];
	        this.nrocapvisto = source["nrocapvisto"];
	        this.totalcap = source["totalcap"];
	        this.activo = source["activo"];
	        this.primeravez = source["primeravez"];
	        this.dias = this.convertValues(source["dias"], MobileAnimeDay);
	        this.generos = source["generos"];
	        this.tipo = source["tipo"];
	        this.fechaUltCapVisto = source["fechaUltCapVisto"];
	        this.fechaEstreno = source["fechaEstreno"];
	        this.fechaCreacion = source["fechaCreacion"];
	        this.fechaEliminacion = source["fechaEliminacion"];
	        this.portada = source["portada"];
	        this.pagina = source["pagina"];
	        this.carpeta = source["carpeta"];
	        this.estudios = source["estudios"];
	        this.origen = source["origen"];
	        this.duracion = source["duracion"];
	        this.repetir = this.convertValues(source["repetir"], MobileRepeticion);
	        this.modified_at = source["modified_at"];
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

