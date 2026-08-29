package download

// The download-core integration battery. Five scenarios drive the real core --
// enqueueWithFallback and downloadAvailableEpisodes -- against a REAL filesystem, the real
// filesystem.EpisodeCounter, the real filesystem.Flattener and the real hasPartFilesRecursive
// sensor, with jdSim (service_download_core_sim_test.go) standing in for JDownloader alone.
//
// It closes the structural gap that let incident run-dl1532pqkk3g ship: baseDeps sets
// DetectStartPhaseDisabled, so of roughly seventy full-run test invocations essentially none
// enter FASE 1 -- the phase where that incident's defects lived. A t.TempDir() handed to a
// test that also calls setSvcFakeCounter is only a path string: the counter and the flattener
// answering the core are maps, so no assertion there ever observed a real byte.
//
// Every scenario owns its own jdSim, t.TempDir(), *time.Time and recorder. t.Parallel() is
// used at the top level only, and no subtest shares mutable state: shared sim state is the one
// realistic route to flakiness here, and a flaky battery is a deleted battery.

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/download/sites"
)

// coreIntegrationHosters builds the hoster order enqueueWithFallback iterates. jdSim reads the
// hoster back off the URLs, exactly as the real JD client only ever sees links.
func coreIntegrationHosters(hosters ...string) []hosterLink {
	ordered := make([]hosterLink, 0, len(hosters))
	for _, hoster := range hosters {
		ordered = append(ordered, hosterLink{hoster: hoster, links: []string{coreIntegrationURL(hoster)}})
	}
	return ordered
}

// coreIntegrationURL renders the download URL for a hoster.
func coreIntegrationURL(hoster string) string {
	switch hoster {
	case "Mega":
		return "http://mega.example/link"
	default:
		return "http://mediafire.example/link"
	}
}

// TestDownloadCoreConfirmsAnEpisodeThatLandedDuringTheGrace is S1, the incident replay. The
// transfer opens and closes entirely inside the single PollSleep carrying the clock from t=40
// to t=60, so all three .part probes miss it and only the post-grace disk re-check can see the
// episode. Under the incident's code that re-check did not exist: JD was asked for a verdict,
// answered "no signal", the package was removed and a second hoster was started over an
// episode already sitting on disk.
func TestDownloadCoreConfirmsAnEpisodeThatLandedDuringTheGrace(t *testing.T) {
	t.Parallel()

	folder := t.TempDir()
	seedRootEpisodes(t, folder, 4)
	now := time.Now()
	sim := newJDSim(t, folder, &now,
		landsPartAt(45*time.Second, "", "d2ouiemgt90z"),
		finishesPartAt(55*time.Second, "", "d2ouiemgt90z"),
	)
	svc, recorder := newCoreIntegrationService(t, sim, &now)

	result := svc.enqueueWithFallback(context.Background(), "run-1", testAnime(folder),
		coreIntegrationHosters("Mediafire", "Mega"), 5)

	assertEnqueueResult(t, result, true, 0, "grace_disk_confirmed", 5)
	// Mega never enqueued and no package removed IS the spec's "MUST NOT start a fallback
	// hoster attempt", read off the JD seam instead of off a log line.
	assertSimLedger(t, sim, []string{"Mediafire"}, 0)
	assertPathStillThere(t, filepath.Join(folder, "Test Anime - 05.mp4"),
		"the JD-side rename ran while JD still held the finished link")
	assertPathGone(t, filepath.Join(folder, "d2ouiemgt90z.mp4"),
		"the episode was renamed off its opaque hoster name")
	assertRootVideoCount(t, folder, 5)
	// Last, because recorder.only is fatal: every reading above is independent, and a broken
	// run should name all of them rather than stop at the ledger.
	assertAttemptLedger(t, recorder, "success")
}

// assertAttemptLedger asserts the per-attempt ledger holds exactly one row with the given
// outcome. Exactly one row is the assertion: a second row would mean a fallback attempt ran.
func assertAttemptLedger(t *testing.T, recorder *fieldsRecorder, outcome string) {
	t.Helper()
	entry := recorder.only(t, "download.hoster_attempt")
	if entry.metadata["outcome"] != outcome {
		t.Fatalf("expected the single attempt to be recorded as %q, got %#v", outcome, entry.metadata)
	}
}

// TestDownloadCoreFlattensAPackageSubfolderLandingToTheRoot is S2. The transfer is VISIBLE to
// the production .part sensor on the second probe -- the first time any test has observed
// hasPartFilesRecursive return true from inside a run. The five direct unit tests call it with
// a folder argument, and its one in-run use points at a folder that never exists.
func TestDownloadCoreFlattensAPackageSubfolderLandingToTheRoot(t *testing.T) {
	t.Parallel()

	folder := t.TempDir()
	now := time.Now()
	sim := newJDSim(t, folder, &now,
		landsPartAt(25*time.Second, "pkg-01", "9gm31meptrvq"),
		finishesPartAt(90*time.Second, "pkg-01", "9gm31meptrvq"),
	)
	svc, recorder := newCoreIntegrationService(t, sim, &now)

	result := svc.enqueueWithFallback(context.Background(), "run-1", testAnime(folder),
		coreIntegrationHosters("Mediafire"), 1)

	assertDetectStartSaw(t, recorder, 2)
	assertEnqueueResult(t, result, true, 0, "fs_poll_confirmed", 1)
	assertSimLedger(t, sim, []string{"Mediafire"}, 0)
	assertRootVideoCount(t, folder, 1)
	assertPathGone(t, filepath.Join(folder, "pkg-01"),
		"the real Flattener moved the video to the root and removed the emptied package folder")

	// STOP HERE. pollForCompletion checks the root, flattens, and completes on the NEXT
	// iteration, so on a subfolder landing the Flatten runs BEFORE the rename -- the exact
	// inversion completeDownloadedEpisode's own doc comment warns about (design F2, SDD-63).
	// It is RECORDED, NOT FIXED and deliberately NOT ASSERTED here: whether JD's real
	// link-rename survives that move is not verifiable from this repository, because the JD
	// adapter is a network client. An assertion on the outcome would pin only jdSim's model of
	// JD -- the unfaithful-fixture failure class that already bit SDD-62's C5, where a fixture
	// that could not occur in production stayed green and read as evidence. Do not add it.
}

// assertDetectStartSaw asserts the detect phase recorded exactly one success whose probe
// timeline has the given length and ends on a positive reading.
func assertDetectStartSaw(t *testing.T, recorder *fieldsRecorder, probeCount int) {
	t.Helper()
	probes := metadataProbes(t, recorder.only(t, "download.detect_start_succeeded"))
	if len(probes) != probeCount {
		t.Fatalf("expected the detect phase to record %d probes, got %#v", probeCount, probes)
	}
	if probes[len(probes)-1]["found"] != true {
		t.Fatalf("expected the last probe to have found the transfer, got %#v", probes)
	}
}

// TestDownloadCoreDeclinesTheDiskRecheckWhenNothingLanded is S3. The folder stays empty for the
// whole attempt, so the post-grace disk re-check must DECLINE and let JD's dead verdict stand.
// Without this scenario the re-check is proven to fire but never to be CONDITIONAL, which is
// the entire distance between the SDD-62 fix and a guard that turns every failure into a
// success. It is the only scenario that kills the `>` to `>=` mutant on an empty folder.
func TestDownloadCoreDeclinesTheDiskRecheckWhenNothingLanded(t *testing.T) {
	t.Parallel()

	folder := t.TempDir()
	now := time.Now()
	sim := newJDSim(t, folder, &now, jdReportsDead(30*time.Second))
	svc, recorder := newCoreIntegrationService(t, sim, &now)

	result := svc.enqueueWithFallback(context.Background(), "run-1", testAnime(folder),
		coreIntegrationHosters("Mediafire"), 1)

	assertEnqueueResult(t, result, false, 0, "grace_classified_dead", 0)
	assertSimLedger(t, sim, []string{"Mediafire"}, 1)
	assertRootVideoCount(t, folder, 0)
	assertEntryCount(t, recorder, "download.renamed", 0)
}

// TestDownloadCoreKeepsTwoLevelResidueOutOfTheSuccessComparison is S4. It pins the premise
// SDD-62's R-3 decision rests on: Flatten is ONE level deep, so a video two levels down is
// residue that survives forever, and comparing a recursive reading against the ROOT baseline
// would let it declare a success that never happened -- permanently skipping a real episode no
// later run retries.
//
// If this test fails, SDD-62 needs revisiting, NOT this test. Never weaken the assertion, fold
// the residue into the baseline, or quarantine the scenario: open a change against that
// decision instead. It is the only scenario that kills the recursiveBaseline-to-baselineCount
// mutant.
func TestDownloadCoreKeepsTwoLevelResidueOutOfTheSuccessComparison(t *testing.T) {
	t.Parallel()

	folder := t.TempDir()
	residue := filepath.Join(folder, "pkg", "sub", "leftover.mp4")
	seedResidue(t, residue)
	now := time.Now()
	sim := newJDSim(t, folder, &now)
	svc, _ := newCoreIntegrationService(t, sim, &now)

	// The same call prepareAnimeDownload makes before every anime, so "residue survives" is a
	// claim about production and not about a test that simply never flattened.
	svc.flattenDownloadFolder(context.Background(), "run-1", testAnime(folder))
	assertPathStillThere(t, residue, "Flatten only reaches the immediate subdirectory layer")

	result := svc.enqueueWithFallback(context.Background(), "run-1", testAnime(folder),
		coreIntegrationHosters("Mediafire"), 1)

	assertEnqueueResult(t, result, false, 0, "grace_no_signal_first", 0)
	assertSimLedger(t, sim, []string{"Mediafire"}, 1)
	assertRootVideoCount(t, folder, 0)
	assertPathStillThere(t, residue, "nothing in the attempt may move or count two-level residue")
}

// seedResidue writes a pre-existing video two directory levels below the fixture root.
func seedResidue(t *testing.T, path string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("create residue directory for %q: %v", path, err)
	}
	if err := os.WriteFile(path, []byte("video"), 0o644); err != nil {
		t.Fatalf("write residue %q: %v", path, err)
	}
}

// TestDownloadCoreRenamesInsideThePackageFolderBeforeFlattening is S5, two consecutive
// episodes through downloadAvailableEpisodes. Episode 5 lands in a package subfolder, so the
// JD-side rename must run while JD still knows that path -- asserting the literal
// "Test Anime - 05.mp4" at the root is the only test anywhere that pins the order rule
// completeDownloadedEpisode's doc comment declares; today that rule rests on the comment alone.
//
// The second episode also proves the cursor moves from BYTES: CountAtRoot is non-recursive, so
// if Flatten does not move episode 5 to the root the loop re-attempts episode 5 forever.
func TestDownloadCoreRenamesInsideThePackageFolderBeforeFlattening(t *testing.T) {
	t.Parallel()

	folder := t.TempDir()
	seedRootEpisodes(t, folder, 4)
	now := time.Now()
	sim := newJDSim(t, folder, &now,
		landsPartAt(45*time.Second, "pkg-05", "d2ouiemgt90z"),
		finishesPartAt(55*time.Second, "pkg-05", "d2ouiemgt90z"),
		landsPartAt(105*time.Second, "", "9gm31meptrvq"),
		finishesPartAt(115*time.Second, "", "9gm31meptrvq"),
	)
	svc, recorder := newCoreIntegrationService(t, sim, &now)

	// downloadAvailableEpisodes loops while the disk-derived cursor is below the latest
	// episode, so a mutant that stalls that cursor hangs instead of failing. Cancelling is what
	// turns the hang back into an ordinary assertion failure (ctx.Err() is checked at the loop
	// top), and the enqueue budget is what decides when to cancel.
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	sim.cancel = cancel

	outcome := svc.downloadAvailableEpisodes(ctx, "run-1", coreIntegrationAnime(folder),
		fixedJDGate(true), coreIntegrationPreparation(folder), func(animeProgressDelta) {})

	assertEpisodeRange(t, outcome, 2, 5, 6)
	assertPathStillThere(t, filepath.Join(folder, "Test Anime - 05.mp4"),
		"the rename ran inside pkg-05 BEFORE the Flattener moved the file to the root")
	assertPathStillThere(t, filepath.Join(folder, "Test Anime - 06.mp4"),
		"the second episode landed at the root and was renamed there")
	assertPathGone(t, filepath.Join(folder, "pkg-05"),
		"the real Flattener emptied and removed the package folder")
	assertRootVideoCount(t, folder, 6)
	assertSimLedger(t, sim, []string{"Mediafire", "Mediafire"}, 0)
	assertEntryCount(t, recorder, "download.rename_failed", 0)
}

// coreIntegrationSourceURL is the anime page URL S5's fake episode source answers for.
const coreIntegrationSourceURL = "https://jkanime.net/core/"

// coreIntegrationAnime builds S5's anime, which needs a source URL the pipeline can resolve
// episode pages against.
func coreIntegrationAnime(folder string) contracts.MobileAnime {
	anime := testAnime(folder)
	sourceURL := coreIntegrationSourceURL
	anime.SourceURL = &sourceURL
	return anime
}

// coreIntegrationPreparation builds the prepared listing S5 hands downloadAvailableEpisodes:
// four episodes already on disk and six available online.
func coreIntegrationPreparation(folder string) animeDownloadPreparation {
	return animeDownloadPreparation{
		source: &svcFakeEpisodeSource{name: "jkanime", extractLinks: map[string][]sites.DownloadLink{
			coreIntegrationSourceURL + "5/": {{Hoster: "Mediafire", URL: coreIntegrationURL("Mediafire")}},
			coreIntegrationSourceURL + "6/": {{Hoster: "Mediafire", URL: coreIntegrationURL("Mediafire")}},
		}},
		listing:       sites.EpisodeListing{LatestEpisode: 6, EpisodePageURL: coreIntegrationSourceURL + "6/"},
		onDiskEpisode: 4,
		destination:   folder,
		sourceURL:     coreIntegrationSourceURL,
	}
}

// assertEpisodeRange asserts how many episodes an anime run downloaded and which numbers
// bracket them.
func assertEpisodeRange(t *testing.T, outcome animeRunOutcome, downloaded, first, last int) {
	t.Helper()
	if outcome.episodesDownloaded != downloaded {
		t.Errorf("expected %d episodes downloaded, got %#v", downloaded, outcome)
	}
	if outcome.firstEpisodeDownloaded != first {
		t.Errorf("expected the first downloaded episode to be %d, got %d", first, outcome.firstEpisodeDownloaded)
	}
	if outcome.lastEpisodeDownloaded != last {
		t.Errorf("expected the last downloaded episode to be %d, got %d", last, outcome.lastEpisodeDownloaded)
	}
}
