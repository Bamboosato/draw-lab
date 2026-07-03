# 処理ロジック仕様書

作成日: 2026-07-02  
対象: draw-lab WEB版トーナメント表作成アプリ PoC  
参照: `docs/requirements.md`, `docs/screen-spec.md`

---

## 1. 目的

本書は、`draw-lab` の中核であるトーナメント生成処理を、実装可能な関数・責務・テスト観点に分解するための仕様である。

対象はPoC範囲の以下とする。

- 入力正規化
- 名簿バリデーション
- 乱数シード管理
- シード配置
- BYE配置
- ノーシード配置
- チーム・地区偏り回避
- 生成結果データ作成
- JSON入出力

描画仕様そのものは `docs/screen-spec.md` のプレビュー画面仕様を参照する。

---

## 2. 基本方針

トーナメント生成ロジックは、UIやReactに依存しない純粋関数群として実装する。

推奨配置:

```text
src/domain/
  types.ts
  validation.ts
  random.ts
  seedPlacement.ts
  byePlacement.ts
  scoring.ts
  drawGenerator.ts
  bracketStructure.ts
```

以下の依存方向を守る。

```text
UI層
  ↓
domain/drawGenerator.ts
  ↓
validation / seedPlacement / byePlacement / scoring / random
```

`domain/` から `components/` や `renderers/` を参照してはならない。

---

## 3. 用語定義

| 用語 | 意味 |
|---|---|
| Entrant | トーナメントに参加する単位。シングルスでは1選手、ダブルスでは1ペア |
| Player | 個々の選手。PoCではEntrant内のplayer1/player2として表現する |
| DrawSlot | ドロー上の1枠。選手またはBYEが入る |
| Position | ドロー上の枠番号。1始まりを推奨 |
| Match | 初戦などの対戦単位。PoCでは主に初戦衝突判定に使う |
| Block | 山、準決勝ブロック、準々決勝ブロックなどの範囲 |
| Seed | シード番号。上位選手・ペアの配置制約に使う |
| BYE | 不戦勝枠。選手ではなくスロット状態として扱う |
| RandomSeed | 生成結果の再現性を担保するseed |

---

## 4. データ型

## 4.1 Tournament

```ts
type Tournament = {
  id: string;
  title?: string;
  date?: string;
  venue?: string;
  eventName?: string;
  matchType: "singles" | "doubles";
  drawSize: DrawSize;
  seedCount: number;
  entrants: Entrant[];
  options: DrawOptions;
  generatedDraw?: GeneratedDraw;
  createdAt: string;
  updatedAt: string;
};
```

## 4.2 DrawSize

```ts
type DrawSize = 4 | 8 | 16 | 32 | 64 | 128;
```

## 4.3 Entrant

```ts
type Entrant = {
  id: string;
  seedNo?: number;
  player1Name: string;
  player2Name?: string;
  team1?: string;
  team2?: string;
  sameTeam?: boolean;
  sameTeamGroup?: string;
  region?: string;
};
```

## 4.4 DrawOptions

```ts
type DrawOptions = {
  avoidSameTeam: boolean;
  avoidSameRegion: boolean;
  prioritizeSeedBye: boolean;
  randomSeed?: string;
};
```

## 4.5 GeneratedDraw

```ts
type GeneratedDraw = {
  id: string;
  tournamentId: string;
  randomSeed: string;
  slots: DrawSlot[];
  generatedAt: string;
};
```

## 4.6 DrawSlot

```ts
type DrawSlot = {
  position: number;
  entrantId?: string;
  isBye: boolean;
  seedNo?: number;
};
```

## 4.7 ValidationResult

```ts
type ValidationResult = {
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
};

type ValidationIssue = {
  code: string;
  message: string;
  entrantId?: string;
  field?: string;
};
```

---

## 5. 全体生成フロー

実装上の中核関数は `generateDraw` とする。

```ts
function generateDraw(input: GenerateDrawInput): GenerateDrawResult;
```

```ts
type GenerateDrawInput = {
  tournament: Tournament;
  now?: string;
};

type GenerateDrawResult = {
  draw?: GeneratedDraw;
  validation: ValidationResult;
};
```

処理順序:

```text
1. Tournamentを正規化する
2. Entrantを正規化する
3. バリデーションを実行する
4. エラーがあれば生成を中断する
5. 乱数seedを決定する
6. 空のDrawSlot[]を作成する
7. シードEntrantを抽出する
8. シード配置位置を計算する
9. シードEntrantを配置する
10. BYE数を計算する
11. BYEを配置する
12. ノーシードEntrantを配置する
13. GeneratedDrawを作成する
14. 結果を返す
```

---

## 6. 入力正規化

## 6.1 目的

画面入力やJSONインポートの揺れを抑え、後続処理が扱いやすいデータへ変換する。

## 6.2 推奨関数

```ts
function normalizeTournament(tournament: Tournament): Tournament;
function normalizeEntrants(entrants: Entrant[], matchType: "singles" | "doubles"): Entrant[];
```

## 6.3 正規化ルール

| 対象 | ルール |
|---|---|
| 文字列 | 前後空白をtrimする |
| 空文字 | undefinedまたは空扱いに統一する |
| seedNo | 数値化できる場合はnumberへ変換する |
| team1/team2 | trimする |
| region | trimする |
| sameTeam | 旧データ互換用。未指定の場合はfalse扱い |
| sameTeamGroup | trimする。空文字は未指定扱い。指定時は1〜5文字 |
| id | 未設定の場合は生成する |

## 6.4 注意点

- 正規化でデータを勝手に補完しすぎない
- 選手名の表記揺れ統合はPoC対象外
- 全角数字の数値化は任意。実装する場合はテストを追加する

---

## 7. バリデーション

## 7.1 推奨関数

```ts
function validateTournament(tournament: Tournament): ValidationResult;
```

## 7.2 エラー

| code | 条件 | message |
|---|---|---|
| `MATCH_TYPE_REQUIRED` | matchTypeが未設定 | 種目区分を選択してください |
| `DRAW_SIZE_REQUIRED` | drawSizeが未設定 | ドローサイズを選択してください |
| `INVALID_DRAW_SIZE` | drawSizeが4,8,16,32,64,128以外 | ドローサイズが不正です |
| `SEED_COUNT_EXCEEDS_DRAW_SIZE` | seedCount > drawSize | シード数はドローサイズ以下にしてください |
| `NO_ENTRANTS` | 有効参加者が0件 | 参加者を1件以上入力してください |
| `ENTRANTS_EXCEED_DRAW_SIZE` | 有効参加者数 > drawSize | 参加者数がドローサイズを超えています |
| `PLAYER_NAME_REQUIRED` | シングルスでplayer1Nameなし | 選手名を入力してください |
| `SEED_NO_INVALID` | seedNoが数値でない | シード番号は数値で入力してください |

## 7.3 警告

| code | 条件 | message |
|---|---|---|
| `DUPLICATE_PLAYER_NAME` | 同一選手名が複数存在 | 同じ選手名が複数行にあります |
| `DOUBLES_PLAYER_MISSING` | ダブルスで片方の選手名のみ入力 | ダブルスの選手名が片方のみ入力されています |
| `UNUSUAL_SEED_DUPLICATION` | 同順位として解釈可能だが不自然な重複 | シード番号の重複があります |
| `SEED_COUNT_MISMATCH` | seedCountと実際のseed指定数に差がある | シード数とシード指定人数が一致していません |

## 7.4 有効参加者の判定

以下を有効参加者とする。

- シングルス: `player1Name` が存在する
- ダブルス: `player1Name` または `player2Name` が存在する

ただし、ダブルスで片方しかない場合は警告とする。

---

## 8. 乱数シード

## 8.1 目的

同じ入力と同じseedで同じ生成結果を再現できるようにする。

## 8.2 推奨関数

```ts
function createRandomSeed(): string;
function createSeededRandom(seed: string): () => number;
function shuffleWithRandom<T>(items: T[], random: () => number): T[];
```

## 8.3 要件

- `Math.random()` を生成ロジック内で直接使わない
- seed文字列から疑似乱数関数を生成する
- 同じseedでは同じ乱数列を返す
- `GeneratedDraw.randomSeed` に実際に使用したseedを保存する

## 8.4 推奨実装

PoCでは、軽量なseeded randomを独自実装してよい。

例:

- string hash + mulberry32
- xmur3 + sfc32

外部ライブラリ導入は任意だが、依存を増やしすぎない。

---

## 9. ブラケット構造

## 9.1 目的

positionから初戦、山、ブロックを判定できるようにする。

## 9.2 推奨関数

```ts
function createEmptySlots(drawSize: DrawSize): DrawSlot[];
function getFirstRoundMatchIndex(position: number): number;
function getHalfIndex(position: number, drawSize: DrawSize): 0 | 1;
function getQuarterIndex(position: number, drawSize: DrawSize): number;
function getBlockIndex(position: number, drawSize: DrawSize, blockSize: number): number;
function getOpponentPosition(position: number): number;
```

## 9.3 position仕様

positionは1始まりとする。

例: 16ドロー

```text
position: 1〜16
初戦: (1,2), (3,4), (5,6), ... (15,16)
上半分: 1〜8
下半分: 9〜16
準々決勝ブロック: 1〜4, 5〜8, 9〜12, 13〜16
```

## 9.4 受け入れ条件

- positionから初戦相手positionを求められること
- positionから上半分/下半分を求められること
- positionから任意ブロックを求められること

---

## 10. シード配置

## 10.1 目的

シード選手をトーナメント上の適切な位置へ配置する。

## 10.2 推奨関数

```ts
function getSeedPositions(drawSize: DrawSize, seedCount: number): number[];
function placeSeededEntrants(params: PlaceSeededEntrantsParams): DrawSlot[];
```

```ts
type PlaceSeededEntrantsParams = {
  slots: DrawSlot[];
  entrants: Entrant[];
  drawSize: DrawSize;
  seedCount: number;
  random: () => number;
};
```

## 10.3 基本ルール

PoCでは以下の考え方で実装する。

| シード | 配置方針 |
|---|---|
| 1 | 上側の山の最上部 |
| 2 | 下側の山の最下部 |
| 3〜4 | 準決勝ブロックに分散 |
| 5〜8 | 準々決勝ブロックに分散 |
| 9〜16 | さらに細かいブロックに分散 |

厳密な競技団体ルール完全準拠はPoC対象外。

## 10.4 seedCount

`seedCount` は、シード配置対象となる最大シード枠数を表す。

例:

- drawSize 16, seedCount 4 → seed positionは4枠
- drawSize 32, seedCount 8 → seed positionは8枠

## 10.5 同順位シード

同順位シードがある場合は、その順位が該当するシード枠範囲内でランダム配置する。

例:

```text
seedNo: 5,5,7,8
```

この場合、5〜8シード枠グループ内で該当者をシャッフルして配置する。

## 10.6 注意点

- シード指定のないEntrantはここでは配置しない
- シードEntrantがseedCountより多い場合は警告またはエラー方針を検討する
- seedNoがdrawSizeを超える場合はバリデーションエラーにすることを推奨

---

## 11. BYE配置

## 11.1 目的

参加者数がドローサイズ未満の場合、空き枠をBYEとして配置する。

## 11.2 推奨関数

```ts
function calculateByeCount(drawSize: DrawSize, entrantCount: number): number;
function placeByes(params: PlaceByesParams): DrawSlot[];
```

```ts
type PlaceByesParams = {
  slots: DrawSlot[];
  byeCount: number;
  drawSize: DrawSize;
  prioritizeSeedBye: boolean;
  random: () => number;
};
```

## 11.3 基本ルール

- BYE数 = drawSize - 有効参加者数
- BYEは `DrawSlot.isBye = true` として表現する
- BYEはentrantとして扱わない
- BYE同士の初戦対戦は避ける
- `prioritizeSeedBye` がtrueの場合、シード選手の初戦相手枠を優先する
- シードがない、またはBYEが余る場合は全体に分散する

## 11.4 シード側優先BYE

シード選手が配置済みの場合、以下を優先する。

```text
シード選手のpositionの初戦相手positionにBYEを置く
```

例:

```text
position 1 に第1シード
相手position 2 にBYE
```

## 11.5 分散BYE

シード側に置き切れないBYE、またはシードがない場合は、以下の条件で候補を選ぶ。

- 既に埋まっていないslot
- 初戦相手がBYEでないslot
- 各half / quarterに偏りすぎないslot

---

## 12. ノーシード配置

## 12.1 目的

シードとBYE配置後の空き枠へ、ノーシードEntrantを配置する。

## 12.2 推奨関数

```ts
function placeUnseededEntrants(params: PlaceUnseededEntrantsParams): DrawSlot[];
```

```ts
type PlaceUnseededEntrantsParams = {
  slots: DrawSlot[];
  entrants: Entrant[];
  drawSize: DrawSize;
  options: DrawOptions;
  random: () => number;
};
```

## 12.3 基本方針

配置は、候補slotごとにペナルティスコアを計算し、最もスコアが低い候補を優先する。

同点の場合は、seeded randomで候補をランダム選択する。

## 12.4 配置順

PoCでは以下のどちらかを採用する。

推奨はA案。

### A案: 所属人数が多いグループから配置

```text
1. ノーシードEntrantをチーム・地区の人数順に並べる
2. 多いグループのEntrantから配置する
3. 候補slotのペナルティスコアを計算する
4. 最低スコアのslotへ配置する
```

### B案: 入力順 + ペナルティ配置

```text
1. 入力順を維持する
2. 候補slotのペナルティスコアを計算する
3. 最低スコアのslotへ配置する
```

A案の方が、同所属が多い場合の偏りを抑えやすい。

---

## 13. 偏り回避スコア

## 13.1 目的

同チーム・同地区が初戦や同じ山に偏らないよう、候補slotを評価する。

## 13.2 推奨関数

```ts
function calculatePlacementPenalty(params: PlacementPenaltyParams): number;
```

```ts
type PlacementPenaltyParams = {
  entrant: Entrant;
  candidatePosition: number;
  slots: DrawSlot[];
  entrantsById: Map<string, Entrant>;
  drawSize: DrawSize;
  options: DrawOptions;
};
```

## 13.3 ペナルティ例

初期値は以下を推奨する。数値はPoC用の仮値であり、テスト後に調整可能。

| 条件 | ペナルティ |
|---|---:|
| 同チーム初戦対戦 | 1000 |
| 同地区初戦対戦 | 500 |
| 同チームが同じquarterに存在 | 120 |
| 同地区が同じquarterに存在 | 80 |
| 同チームが同じhalfに存在 | 40 |
| 同地区が同じhalfに存在 | 25 |

## 13.4 同チーム判定

シングルス:

```text
entrant.team1 が一致すれば同チーム
```

ダブルス:

```text
実所属:
  team1 / team2 のどちらかが候補相手の team1 / team2 と一致すれば関連チームとして扱う

同チーム扱い:
  sameTeamGroup が同じ文字列なら同一チーム扱いとして扱う
```

PoC初期では、空のteamは判定対象外とする。

## 13.5 同地区判定

```text
region が空でなく、かつ一致する場合に同地区とする
```

## 13.6 初戦対戦判定

候補positionの初戦相手positionを取得し、既にentrantが配置されている場合に判定する。

```ts
const opponentPosition = getOpponentPosition(candidatePosition);
```

---

## 14. GeneratedDraw作成

## 14.1 推奨関数

```ts
function createGeneratedDraw(params: CreateGeneratedDrawParams): GeneratedDraw;
```

```ts
type CreateGeneratedDrawParams = {
  tournamentId: string;
  randomSeed: string;
  slots: DrawSlot[];
  now: string;
};
```

## 14.2 要件

- `id` を生成する
- `tournamentId` を保持する
- `randomSeed` を保持する
- `slots` はposition昇順に並べる
- `generatedAt` を保持する

---

## 15. JSONエクスポート

## 15.1 推奨関数

```ts
function exportTournamentToJson(tournament: Tournament): string;
```

## 15.2 要件

- Tournament一式をJSON文字列へ変換する
- 可能であれば `schemaVersion` を含める
- インデント付きで人間が読める形式にする

推奨形式:

```ts
type TournamentExport = {
  schemaVersion: 1;
  exportedAt: string;
  tournament: Tournament;
};
```

---

## 16. JSONインポート

## 16.1 推奨関数

```ts
function importTournamentFromJson(jsonText: string): ImportTournamentResult;
```

```ts
type ImportTournamentResult = {
  tournament?: Tournament;
  validation: ValidationResult;
};
```

## 16.2 要件

- JSONとして解析できない場合はエラー
- `schemaVersion` が未設定でも、PoCでは可能な範囲で読み込む
- インポート時は新しいTournament IDを採番する
- createdAt / updatedAt はインポート時点で更新する
- generatedDrawが含まれている場合も復元する

## 16.3 エラー例

| code | 条件 | message |
|---|---|---|
| `JSON_PARSE_ERROR` | JSONとして解析不能 | JSONを解析できません |
| `IMPORT_MISSING_TOURNAMENT` | tournamentが存在しない | トーナメントデータが見つかりません |
| `IMPORT_INVALID_TOURNAMENT` | Tournamentとして不正 | トーナメントデータが不正です |

---

## 17. ローカル保存

## 17.1 推奨関数

```ts
async function listTournaments(): Promise<Tournament[]>;
async function getTournament(id: string): Promise<Tournament | undefined>;
async function saveTournament(tournament: Tournament): Promise<void>;
async function deleteTournament(id: string): Promise<void>;
async function duplicateTournament(id: string): Promise<Tournament>;
```

## 17.2 初期実装

PoCではlocalStorageでも可。

localStorageを使う場合のキー例:

```text
draw-lab:tournaments
```

ただし、将来的にはIndexedDBへ差し替えられるよう、UIからは直接localStorageを呼ばず、storage層の関数経由にする。

---

## 18. レンダラーへの入力

## 18.1 目的

生成ロジックと描画ロジックを分離する。

## 18.2 推奨関数

```ts
function buildBracketViewModel(tournament: Tournament, draw: GeneratedDraw): BracketViewModel;
```

## 18.3 ViewModel案

```ts
type BracketViewModel = {
  title?: string;
  date?: string;
  venue?: string;
  eventName?: string;
  drawSize: DrawSize;
  rows: BracketRow[];
};

type BracketRow = {
  position: number;
  label: string;
  seedNo?: number;
  teamLabel?: string;
  region?: string;
  isBye: boolean;
};
```

レンダラーは `Tournament` と `GeneratedDraw` を直接解釈しすぎず、ViewModelを受け取って描画する。

---

## 19. 単体テスト観点

## 19.1 validation.test.ts

| ケース | 期待結果 |
|---|---|
| 参加者0件 | `NO_ENTRANTS` エラー |
| 参加者数 > drawSize | `ENTRANTS_EXCEED_DRAW_SIZE` エラー |
| シングルスで選手名なし | `PLAYER_NAME_REQUIRED` エラー |
| シード番号が文字列 | `SEED_NO_INVALID` エラー |
| 同一選手名あり | `DUPLICATE_PLAYER_NAME` 警告 |
| ダブルスで片方のみ入力 | `DOUBLES_PLAYER_MISSING` 警告 |

## 19.2 random.test.ts

| ケース | 期待結果 |
|---|---|
| 同じseed | 同じ乱数列になる |
| 異なるseed | 異なる乱数列になる可能性が高い |
| shuffleWithRandom | 同じseedなら同じ並びになる |

## 19.3 bracketStructure.test.ts

| ケース | 期待結果 |
|---|---|
| position 1 | opponentは2 |
| position 2 | opponentは1 |
| 16ドローposition 1 | halfは0 |
| 16ドローposition 16 | halfは1 |
| 16ドローposition 5 | quarterは1 |

## 19.4 seedPlacement.test.ts

| ケース | 期待結果 |
|---|---|
| 16ドロー第1シード | position 1に配置される |
| 16ドロー第2シード | position 16に配置される |
| 第3・第4シード | 別の準決勝ブロックに分散される |
| 同じseedで同順位シード | 同じ配置になる |

## 19.5 byePlacement.test.ts

| ケース | 期待結果 |
|---|---|
| 13人 / 16ドロー | BYE数は3 |
| シードあり / prioritizeSeedBye true | シード初戦相手側にBYEが入る |
| BYE同士 | 初戦で対戦しない |

## 19.6 scoring.test.ts

| ケース | 期待結果 |
|---|---|
| 同チーム初戦相手がいる | 大きなペナルティ |
| 同地区初戦相手がいる | 中程度のペナルティ |
| 同teamがquarter内にいる | quarterペナルティ |
| avoidSameTeam false | チーム由来ペナルティなし |
| avoidSameRegion false | 地区由来ペナルティなし |

## 19.7 drawGenerator.test.ts

| ケース | 期待結果 |
|---|---|
| 16人 / 16ドロー | BYEなしで16slot埋まる |
| 13人 / 16ドロー | 3つのBYEが入る |
| 同じseed | 完全に同じslotsになる |
| 異なるseed | 配置が変わる可能性がある |
| シードあり | シードが所定位置に配置される |
| 参加者超過 | drawが返らずvalidation errorになる |

---

## 20. 実装優先順位

Codexに実装させる場合は、以下の順序を推奨する。

```text
1. src/domain/types.ts
2. src/domain/random.ts + tests
3. src/domain/bracketStructure.ts + tests
4. src/domain/validation.ts + tests
5. src/domain/seedPlacement.ts + tests
6. src/domain/byePlacement.ts + tests
7. src/domain/scoring.ts + tests
8. src/domain/drawGenerator.ts + tests
9. src/storage/tournamentStorage.ts
10. src/storage/jsonExport.ts / jsonImport.ts
11. src/renderers/svgBracketRenderer.ts
12. UI components
13. print CSS
```

---

## 21. 完了条件

処理ロジック面の完了条件は以下。

- `generateDraw` が実装されている
- バリデーションエラー時にdrawを生成しない
- BYE数が正しく計算される
- シードが基本ルールに沿って配置される
- BYE同士が初戦対戦しない
- ノーシードが空き枠に配置される
- チーム・地区偏り回避スコアが動作する
- 同じ乱数seedで同じ結果が再現される
- JSONエクスポート / インポートができる
- 主要ロジックにVitestの単体テストがある
