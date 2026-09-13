function ensureGeminiFolder() {
    var tempFolder = new Folder(Folder.temp.fullName + "/GeminiCaptioner");
    if (!tempFolder.exists) {
        tempFolder.create();
    }
    return tempFolder;
}

function saveSRTToDisk(rawSRT) {
    try {
        var defaultFolder = ensureGeminiFolder();
        var defaultFile = new File(defaultFolder.fsName + "/gemini_caption.srt");
        var saveFile = defaultFile.saveDlg("Save subtitles as", "SubRip:*.srt");
        if (!saveFile) {
            return "CANCELED";
        }
        if (!/\.srt$/i.test(saveFile.name)) {
            saveFile = new File(saveFile.fsName + ".srt");
        }
        saveFile.encoding = "UTF8";
        saveFile.open("w");
        saveFile.write(rawSRT);
        saveFile.close();
        return saveFile.fsName;
    } catch (err) {
        return "JSX Error: " + err;
    }
}

function pushSRTToTimeline(rawSRT) {
    if (!app.project || !app.project.activeSequence) {
        return "No active sequence found.";
    }

    try {
        var folder = ensureGeminiFolder();
        var srtFile = new File(folder.fsName + "/gemini_caption.srt");
        srtFile.encoding = "UTF8";
        srtFile.open("w");
        srtFile.write(rawSRT);
        srtFile.close();

        var seq = app.project.activeSequence;
        if (seq && typeof seq.importCaptionsFromFile === "function") {
            seq.importCaptionsFromFile(srtFile.fsName);
            return "OK";
        }

        var successfullyImported = app.project.importFiles([srtFile.fsName], 1, app.project.rootItem, 0);
        if (!successfullyImported || !successfullyImported.length) {
            return "Failed to import SRT into the project.";
        }

        var importedItem = successfullyImported[0];
        if (!importedItem) {
            return "SRT imported but not found.";
        }

        try {
            var playerPos = seq.getPlayerPosition();
            seq.videoTracks[0].overwriteClip(importedItem, playerPos);
        } catch (clipErr) {
            return "Imported SRT. Add it to a caption track manually (ExtendScript fallback).";
        }

        return "OK";
    } catch (err) {
        return "JSX Error: " + err;
    }
}
