#target "indesign"
/*
SCRIPTMETA-BEGIN
Script-ID: InDesign-swatch-normalizer
Version: 1.0.0
Meta-URL: https://github.com/SatoruTakahashi7/InDesign-swatch-normalizer
Target-App: Adobe InDesign
Name: スウォッチ名とカラー値を整理
Author: GYAHTEI Design Laboratory / Satoru Takahashi
Description-BEGIN
選んだプロセスカラー（CMYK／RGB）をカラー値の名前に変更します。
RGBはInDesignのカラー変換でCMYKに置き換えます。
カラー値を変更しない／1刻み／5刻み／10刻みから選べます。
Description-END
SCRIPTMETA-END

注意事項:
・丸めると、対象スウォッチを使う文字や図形の色も変わります。
・特色、Lab、混合インキ、グラデーション、濃淡、標準スウォッチは対象外。
・同名スウォッチが存在する場合は、その色全体を変更せず報告します。
・RGBはCMYKに変換します。スウォッチの統合は行いません。
・チェック専用APIではなく、カラー値に一致する名前を設定する方式です。
*/
(function () {
    if (app.documents.length === 0) { alert("ドキュメントを開いてから実行してね。"); return; }
    var doc = app.activeDocument;
    var colors = doc.colors.everyItem().getElements();
    var targets = [], i;
    for (i = 0; i < colors.length; i++) {
        var c = colors[i];
        if (c.model !== ColorModel.PROCESS) continue;
        if (c.space !== ColorSpace.CMYK && c.space !== ColorSpace.RGB) continue;
        // 標準色の名前は内部名・日本語表示名の両方を除外する。
        if (/^(\[.*\]|Black|Paper|Registration|None|黒|紙色|レジストレーション|なし)$/.test(c.name)) continue;
        targets.push(c);
    }
    if (!targets.length) { alert("対象になるCMYK／RGBのプロセスカラーがないよ。"); return; }
    var w = new Window("dialog", "スウォッチ名とカラー値を整理");
    w.orientation = "column"; w.alignChildren = "fill";
    w.add("statictext", undefined, "対象のスウォッチ（複数選択可）");
    w.add("statictext", undefined, "選択したRGBスウォッチはCMYKに変換します。");
    var list = w.add("listbox", undefined, [], {multiselect:true});
    list.preferredSize = [520, 280];
    for (i = 0; i < targets.length; i++) {
        list.add("item", targets[i].name + "  ［" + (targets[i].space === ColorSpace.CMYK ? "CMYK" : "RGB") + "］");
        list.items[i].selected = true;
    }
    var select = w.add("group");
    select.add("button", undefined, "すべて選択").onClick = function () {
        for (var j = 0; j < list.items.length; j++) list.items[j].selected = true;
    };
    select.add("button", undefined, "選択解除").onClick = function () {
        for (var j = 0; j < list.items.length; j++) list.items[j].selected = false;
    };
    var naming = w.add("checkbox", undefined, "カラー値を名前にする"); naming.value = true;
    var row = w.add("group"); row.add("statictext", undefined, "カラー値の丸め：");
    var rounding = row.add("dropdownlist", undefined, ["変更しない", "1刻み", "5刻み", "10刻み"]);
    rounding.selection = 0;
    w.add("statictext", undefined, "変換後のCMYK値を四捨五入し、0〜100に収めます。");
    w.add("statictext", undefined, "丸めると、使用中の文字や図形の色も変わります。");
    var buttons = w.add("group"); buttons.alignment = "right";
    var run = buttons.add("button", undefined, "実行", {name:"ok"});
    buttons.add("button", undefined, "キャンセル", {name:"cancel"});
    run.onClick = function () {
        if (!list.selection || !list.selection.length) { alert("対象を選んでね。"); return; }
        w.close(1);
    };
    if (w.show() !== 1) return;
    var chosen = [], selected = list.selection;
    for (i = 0; i < selected.length; i++) chosen.push(targets[selected[i].index]);
    var step = [0, 1, 5, 10][rounding.selection.index];
    var rename = naming.value;
    var changed = 0, unchanged = 0, skipped = [];
    function same(a, b) {
        if (a.length !== b.length) return false;
        for (var k = 0; k < a.length; k++) if (a[k] !== b[k]) return false;
        return true;
    }
    function valueName(color, values) {
        var keys = ["C", "M", "Y", "K"];
        var parts = [];
        for (var k = 0; k < keys.length; k++) parts.push(keys[k] + "=" + Math.round(values[k]));
        return parts.join(" ");
    }
    function process() {
        for (var j = 0; j < chosen.length; j++) {
            var color = chosen[j], oldName = color.name, oldValues = color.colorValue.slice(0);
            var oldSpace = color.space;
            var values = oldValues.slice(0), newName, valueChanged, nameChanged;
            try {
                if (oldSpace === ColorSpace.RGB) {
                    color.space = ColorSpace.CMYK;
                    values = color.colorValue.slice(0);
                }
                if (step) {
                    var maximum = 100;
                    for (var k = 0; k < values.length; k++) {
                        values[k] = Math.max(0, Math.min(maximum, Math.round(values[k] / step) * step));
                    }
                }
                newName = rename ? valueName(color, values) : oldName;
                var existing = doc.swatches.itemByName(newName);
                if (rename && existing.isValid && existing.id !== color.id) {
                    color.space = oldSpace;
                    color.colorValue = oldValues;
                    color.name = oldName;
                    skipped.push(oldName + "：同名「" + newName + "」が存在するため変更なし"); continue;
                }
                valueChanged = !same(oldValues, values); nameChanged = oldName !== newName;
                if (valueChanged) color.colorValue = values;
                // 同じ名前でも再設定し、カラー値による命名として認識させる。
                if (rename) color.name = newName;
                if (oldSpace !== color.space || valueChanged || nameChanged) changed++; else unchanged++;
            } catch (e) {
                var restoreErrors = [];
                try { color.space = oldSpace; } catch (r0) { restoreErrors.push(String(r0)); }
                try { color.colorValue = oldValues; } catch (r1) { restoreErrors.push(String(r1)); }
                try { color.name = oldName; } catch (r2) { restoreErrors.push(String(r2)); }
                skipped.push(oldName + "：" + String(e) + (restoreErrors.length ? "／復元失敗：" + restoreErrors.join("、") : "（元の値へ復元）"));
            }
        }
    }
    try {
        app.doScript(process, ScriptLanguage.JAVASCRIPT, undefined, UndoModes.ENTIRE_SCRIPT, "スウォッチ名とカラー値を整理");
    } catch (fatal) { alert("処理中にエラー：" + String(fatal) + "\nドキュメントの状態を確認してね。"); return; }
    var message = "変更：" + changed + "色\n値・名前が同じ：" + unchanged + "色\n未処理／エラー：" + skipped.length + "色";
    if (skipped.length) message += "\n\n" + skipped.join("\n");
    var result = new Window("dialog", "スウォッチ整理の結果");
    result.orientation = "column"; result.alignChildren = "fill";
    var report = result.add("edittext", undefined, message, {multiline:true, readonly:true, scrolling:true});
    report.preferredSize = [560, 260];
    result.add("button", undefined, "閉じる", {name:"ok"}); result.show();
}());
