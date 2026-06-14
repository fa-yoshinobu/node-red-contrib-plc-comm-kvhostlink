# Refactor Instructions

node-red-contrib-plc-comm-kvhostlink のリファクタリング指示書。
この文書は実装担当モデル向けの完結した作業指示である。実装前にこの文書全体を読むこと。

> **最重要の前提**: このパッケージは npm に公開済み
> (`@fa_yoshinobu/node-red-contrib-plc-comm-kvhostlink` 0.2.10)の Node-RED ノード集で
> あり、Host Link ASCII フレームは実機 KV-5000 / KV-7500 / KV-X500 の検証記録(`TODO.md`)
> に紐づく。**実行時依存ゼロ**の方針を守ること。
>
> このリポジトリは plc-comm 一族の中で**最小・最も健全**である(client.js 506 行、
> ノードは薄い、テストランナーは自前)。**構造変更は不要**。本タスクは
> 安全網(フレーム文字列の特性テスト)の拡充のみであり、
> 変更すべきものが見つからなければ、それを正直に報告して終了してよい。
> 無理に変更量を増やすことを最も強く禁ずる。

---

## Objective

ノードの挙動・msg スキーマ・送信フレーム文字列を一切壊さずに:

1. **送信フレーム文字列の特性テストの網羅を広げる**(`lib/hostlink/client.js` の
   公開コマンドのうちテスト未収録のものについて、現在の送信文字列を固定する)

構造変更・分割・rename は目的ではなく禁止事項である。

---

## Project Understanding

### 何のパッケージか

Node-RED から KEYENCE KV PLC へ上位リンク(Host Link、TCP/UDP、CR 終端の ASCII
コマンド)で読み書きするノード 3 種(`kvhostlink-connection` / `kvhostlink-read` /
`kvhostlink-write`)。

### モジュール構成

| ファイル | 行数 | 内容 |
|---|---|---|
| `lib/hostlink/high-level.js` | 725 | 契約ヘルパ(readTyped / readNamed / poll、read-plan 最適化、TimerCounter 複合値) |
| `lib/hostlink/client.js` | 506 | クライアント(コマンド面 + トランスポート) |
| `lib/hostlink/device.js` | 333 | アドレス解析・検証 |
| `lib/hostlink/protocol.js` | 79 | フレーム組立(CR 終端) |
| `nodes/*.js` | 53〜204 | Node-RED ノード(薄い。健全) |

### テスト / CI

- `test/hostlink-high-level.test.js`(352)/ `hostlink-core.test.js`(170)/
  `run-editor-smoke.js`
- CI: Node 18/20/22 × `npm test` + `npm pack --dry-run`
- 実行: `npm test` / `npm run pack:dry-run`

---

## Behaviors To Preserve(絶対に壊さない既存挙動)

1. **`lib/hostlink/*` の module.exports の形**。
2. **送信フレームの文字列**(CR 終端固定。TODO.md の Cross-Stack 節)。
3. **ノードの設定項目・msg スキーマ・制御メッセージ**(`connect` / `disconnect` /
   `reinitialize`)・メタデータモード。
4. **プロトコル固定事項**(TODO.md): `AT` の書込ヘルパによる送信前拒否(32bit 点扱い、
   `AT0-7`)、タイマ/カウンタ複合値ヘルパの挙動、セマンティック原子性。
5. **依存ゼロ・バージョン 0.2.10・package.json**: 変更しない。

---

## Non-Negotiables(交渉不可の制約)

- 最初に `git status` を確認する。未コミット変更があれば混ぜず、報告して停止する。
- 編集前に Baseline Commands をすべて実行し、結果(テスト件数含む)を記録する。
- 変更はテスト追加のみ。lib/ / nodes/ の実装ファイルを変更しない。
- 追加する期待値は「実装の現在の出力」を機械的に採取したものに限る。
  マニュアルから起こした期待値を勝手に正として書かない(食い違いは Stop And Ask)。
- npm 依存を追加しない。package.json を変更しない。
- 既存テストの既存アサーションを変更しない。
- 実機 PLC への接続を行わない。
- 正しさが不明な場合は実装を止め、「Stop And Ask」として質問を報告書に書く。

---

## Stop And Ask Conditions(即時停止して質問する条件)

- 採取した送信文字列が README / TODO.md / 他スタック(hostlink-rust のベクトル等)と
  食い違って見えた(**修正せず**質問として残す)
- 既存テストが自分の変更後に落ちた ⇒ 即座に巻き戻して報告
- テスト追加のために lib/ 側の変更が必要に見えた(行わずに質問)
- 本書に無い大きな問題を発見した(報告のみ)

---

## Baseline Commands

作業ディレクトリ: リポジトリルート。Node.js 18+。実機 PLC 不要・接続禁止。

```bash
git status
npm test                # テスト件数を記録
npm run pack:dry-run
```

---

## Debt Map

### D1. フレーム文字列テストの網羅不足 【実装可 / 唯一の作業】

- **根拠**: テストは high-level 中心(352 行)で、`client.js` のコマンド面
  (モニタ登録/読出、運転モード、強制セット/リセット、時刻設定、拡張ユニット
  バッファ等)の送信文字列を直接固定するテストが薄い。
- **改善案**: 既存テストの方式(モック接続で送信文字列を記録)に従い、未収録コマンドの
  現在の送信文字列を採取してテスト追加する。
- **リスク**: 低(テスト追加のみ)。

### D2. その他(現状維持 / 報告のみ)

- `high-level.js` の read-plan 機構は他スタックと同型だが、ファイル規模・テスト網羅とも
  許容範囲。触らない。
- `client.js`(506 行)のトランスポート同居も適正規模。分離不要。

---

## Implementation Phases

### Phase 0: 現状確認

1. `git status` 確認(クリーンでなければ停止・報告)
2. Baseline Commands を実行し、結果を記録

### Phase 1: フレーム文字列テスト拡充(D1)

1. `client.js` の公開コマンド × 既存テスト網羅の突き合わせ表を作る
2. 1 コマンドずつ採取 → テスト追加 → `npm test`
3. 食い違いは保留して Stop And Ask に記録し、他は続行

### Phase 2: 検証と報告

全 Verification Requirements を最終実行し、Reporting Format に従って報告。

---

## Verification Requirements

```bash
npm test
npm run pack:dry-run
```

- テスト件数が baseline から増えていること
- `git diff` で確認: 変更が `test/` 配下のみであること

---

## Reporting Format

1. **Baseline 結果**: 実行コマンドと結果(テスト件数)
2. **網羅表**: 公開コマンド × テスト有無(作業前 / 作業後)
3. **追加テスト一覧**: コマンドごとの採取フレーム文字列
4. **食い違い**: 見つけた場合は併記(修正はしない)
5. **検証結果**: 最後に実行したコマンドと結果(失敗を隠さない)
6. **Stop And Ask**: 発生した質問と停止範囲

---

## Out-of-scope Items(やらないこと)

- `lib/` / `nodes/` の実装ファイルの変更全般(構造変更・分割・rename を含む)
- 送信フレーム文字列・msg スキーマ・エラー文言の変更
- テストフレームワーク・依存の導入
- バージョン変更、`CHANGELOG.md` 更新、npm publish
- `examples/` / `docsrc/` の変更
- 実機 PLC を使う検証
- 兄弟リポジトリの変更
