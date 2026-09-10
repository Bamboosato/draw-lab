# 処理ロジック仕様書

作成日: 2026-07-02  
更新日: 2026-09-03
対象: draw-lab WEB版トーナメント表作成アプリ PoC（正式リリース版 1.0.0）
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
- トーナメント・リーグ共通ホーム画面の表示用ViewModel
- トーナメント・リーグの状態集計と最近更新項目の再開先判定
- PWA起動状態とインストールガイダンス状態の判定

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
| Entrant | トーナメントに参加する単位。シングルスでは1選手、ダブルスでは1ペア、チームでは1チーム |
| Player | 個々の選手。シングルス・ダブルスではEntrant内のplayer1/player2、チームではmemberNamesとして表現する |
| DrawSlot | ドロー上の1枠。EntrantまたはBYEが入る |
| Position | ドロー上の枠番号。1始まりを推奨 |
| Match | 回戦内の1対戦カード。対戦者、勝敗、備考、前回戦からの参照関係を持つ |
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
  matchType: "singles" | "doubles" | "team";
  matchFormat: 1 | 3 | 5;
  detailInputEnabled: boolean;
  matchSelectionStatus: "pending" | "confirmed";
  drawSize: DrawSize;
  seedCount: number;
  entrants: Entrant[];
  options: DrawOptions;
  generatedDraw?: GeneratedDraw;
  status?: "inProgress" | "completed";
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
  teamName?: string;
  memberNames?: string[];
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
  seedPositionMode?: "fixed" | "jtaRulebook" | "grandSlam";
  thirdFourthSeedPlacement?: "tennisRule" | "standard";
  fixByePositionOnSeedLottery?: boolean;
  entrantPlacementOrder?: "largeTeamFirst" | "random" | "rosterOrder";
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
  matches: TournamentMatch[];
  generatedAt: string;
  generationInputSignature?: string;
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

## 4.7 TournamentMatch

```ts
type TournamentMatchResult =
  | "unplayed"
  | "participantAWin"
  | "participantBWin";

type TournamentMatchSource =
  | { slotPosition: number }
  | { matchId: string };

type TournamentMatch = {
  id: string;
  round: number;
  matchNo: number;
  sourceA: TournamentMatchSource;
  sourceB: TournamentMatchSource;
  result: TournamentMatchResult;
  setScores?: Array<{ participantA: number | null; participantB: number | null }>;
  note?: string;
};

type TournamentMatchState = "pending" | "ready" | "completed" | "byeAdvance";

type ResolvedTournamentMatch = TournamentMatch & {
  state: TournamentMatchState;
  participantAId?: string;
  participantBId?: string;
  winnerEntrantId?: string;
};
```

`TournamentMatch`は特定の`GeneratedDraw`に属する。1回戦は`DrawSlot.position`、2回戦以降は直前回戦の`matchId`を参照する。現在の対戦者と勝者は参照関係・スロット・結果から導出し、対戦者IDをカードへ重複保存しない。`drawSize`が128の場合も、回戦数は`log2(drawSize)`で生成する。

## 4.8 ValidationResult

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
function normalizeEntrants(entrants: Entrant[], matchType: "singles" | "doubles" | "team"): Entrant[];
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
| teamName | trimする。チーム種目では必須。チーム名の重複は許可する |
| memberNames | 前後空白をtrimし、空要素を除外する。チーム種目では1名以上、上限なし |
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
| `PLAYER_NAME_REQUIRED` | 完全空行ではないシングルス行でplayer1Nameなし | 選手名を入力してください |
| `DOUBLES_PLAYER_MISSING` | 完全空行ではないダブルス行でplayer1Nameまたはplayer2Nameなし | ダブルスの選手名1・選手名2を入力してください |
| `TEAM_NAME_REQUIRED` | 完全空行ではないチーム行でteamNameなし | チーム名を入力してください |
| `TEAM_MEMBER_MISSING` | 完全空行ではないチーム行でmemberNamesが1名未満 | チームのメンバーを1名以上入力してください |
| `SEED_NO_INVALID` | seedNoが数値でない | シード番号は数値で入力してください |
| `SEED_COUNT_MISMATCH` | seedCountと実際のseed指定数に差がある | シード数とシード指定人数が一致していません |
| `RANKING_INVALID` | rankingが1〜9999の整数でない | ランキングは1〜9999の整数で入力してください |

## 7.3 警告

| code | 条件 | message |
|---|---|---|
| `DUPLICATE_PLAYER_NAME` | 同一選手名が複数存在 | 同じ選手名が複数行にあります |
| `UNUSUAL_SEED_DUPLICATION` | 同順位として解釈可能だが不自然な重複 | シード番号の重複があります |

## 7.4 有効参加者の判定

以下を有効参加者とする。

- シングルス: `player1Name` が存在する
- ダブルス: `player1Name` または `player2Name` が存在する
- チーム: `teamName` が存在する

名簿の全入力項目が空の完全空行は、保存データである `Tournament.entrants` から削除しない。検証・生成時だけ除外し、有効参加者数、BYE数、シード指定人数の計算対象に含めない。

名簿入力画面の初期表示行数は `max(drawSize, 最後の非完全空行のindex + 1)` とする。これを超える末尾の完全空行は非表示にするだけで、保存データから削除しない。

選手名が空でも、シード番号、所属チーム、地区、ランキングなどに入力がある行は不完全行として検証対象に含める。シングルスでは `PLAYER_NAME_REQUIRED`、ダブルスで片方または両方の選手名が不足する場合は `DOUBLES_PLAYER_MISSING` エラーとする。

チーム種目では、チーム名が空の行、またはメンバーが1名未満の行を検証対象とし、それぞれ `TEAM_NAME_REQUIRED`、`TEAM_MEMBER_MISSING` エラーとする。チーム名およびメンバー名の重複は検査しない。所属チーム（`team1`）は既存の同チーム対戦回避判定に使用するが、チーム名とは別の項目として扱う。

完全空行はBYEの明示指定として扱わない。BYE数は `drawSize - 有効参加者数` により自動算出する。

`getEntrantStats()` は `activeEntrantCount > drawSize` の場合に `hasEntrantOverflow = true`、`byeCount = undefined` を返す。UIは有効参加者数をエラー対象として表示し、未算出のBYE数は「—」と表示する。

`getEntrantStats()` は名簿のシード指定人数を基本情報の `seedCount` と比較し、`seedAssignmentStatus` として `matched`、`shortage`、`excess` のいずれかを返す。UIは不一致の場合にシード指定人数をエラー対象として表示する。

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
  options: DrawOptions;
  seedPositionLookup?: number[];
  random: () => number;
};
```

## 10.3 基本ルール

PoCでは以下の考え方で実装する。

| シード | 配置方針 |
|---|---|
| 1 | 上側の山の最上部 |
| 2 | 下側の山の最下部 |
| 3〜4 | `thirdFourthSeedPlacement` に従って分散 |
| 5〜8 | 準々決勝ブロックに分散。抽選対象の場合はグループ内で抽選 |
| 9〜16 | さらに細かいブロックに分散。抽選対象の場合はグループ内で抽選 |
| 17〜32 | 128ドローかつグランドスラム方式の場合に抽選対象 |

`seedPositionMode` は以下とする。

| 値 | 内容 |
|---|---|
| `fixed` | シード位置を抽選しない |
| `jtaRulebook` | ExcelマクロのJTAルールブック方式に準じて抽選 |
| `grandSlam` | Excelマクロのグランドスラム方式に準じて、128ドローでは32シードまで抽選 |

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
  options: DrawOptions;
  seedPositionLookup?: number[];
  random: () => number;
};
```

## 11.3 基本ルール

- BYE数 = drawSize - 有効参加者数
- BYEは `DrawSlot.isBye = true` として表現する
- BYEはentrantとして扱わない
- BYEは末尾シード番号を持つ仮想枠として扱い、`drawSize`, `drawSize - 1`, ... の seedNo から位置を決める
- BYE同士の初戦対戦は避ける
- 仮想シード位置に置けない場合は全体に分散する

## 11.4 BYE位置固定

`fixByePositionOnSeedLottery` がtrueの場合、シード位置抽選があってもBYE側の位置は元のシード枠基準で固定する。

```text
16ドローで4 BYEの場合、BYEは内部的に seedNo 16, 15, 14, 13 として配置する
```

例:

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

`entrantPlacementOrder` により以下のいずれかを採用する。デフォルトは `largeTeamFirst`。

### `largeTeamFirst`: メンバーの多いチームから配置

```text
1. ノーシードEntrantを関連チーム人数順に並べる
2. 多いグループのEntrantから配置する
3. 候補slotのペナルティスコアを計算する
4. 最低スコアのslotへ配置する
```

### `random`: ランダムに配置

```text
1. ノーシードEntrantをseeded randomでシャッフルする
2. 候補slotのペナルティスコアを計算する
3. 最低スコアのslotへ配置する
```

### `rosterOrder`: 名簿記載順に配置

```text
1. 入力順を維持する
2. 候補slotのペナルティスコアを計算する
3. 最低スコアのslotへ配置する
```

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
  matches: TournamentMatch[];
  now: string;
};
```

## 14.2 要件

- `id` を生成する
- `tournamentId` を保持する
- `randomSeed` を保持する
- `slots` はposition昇順に並べる
- `matches` にドローサイズに応じた全回戦の対戦カードを生成する
- `generatedAt` を保持する
- 生成結果へ影響する入力から決定的な `generationInputSignature` を作成して保持する

## 14.3 対戦カード生成と勝ち上がり解決

```ts
function createTournamentMatches(
  slots: readonly DrawSlot[],
  drawSize: DrawSize,
  createId: () => string,
): TournamentMatch[];

function resolveTournamentMatches(
  draw: GeneratedDraw,
  entrants: readonly Entrant[],
): ResolvedTournamentMatch[];

function updateTournamentMatch(
  draw: GeneratedDraw,
  matchId: string,
  patch: Pick<TournamentMatch, "result"> & Partial<Pick<TournamentMatch, "setScores" | "note">>,
  matchFormat: 1 | 3 | 5,
): GeneratedDraw;

function updateTournamentMatchSetScore(
  draw: GeneratedDraw,
  matchId: string,
  matchFormat: 1 | 3 | 5,
  setIndex: number,
  participant: "participantA" | "participantB",
  value: number | null,
): GeneratedDraw;
```

`createTournamentMatches`は、1回戦の各2スロットを起点に、直前回戦の2カードを参照するカードを決勝まで作成する。カードの`matchNo`は回戦内で1から採番する。

`resolveTournamentMatches`の解決規則は以下とする。

- 対戦者が2名とも確定した実試合は、結果入力可能な`ready`状態とする
- `result`が`participantAWin`または`participantBWin`の場合、その参加者を勝者として次回戦へ渡す
- 1名とBYEの組み合わせは自動勝ち上がりとし、結果入力を要求しない
- 前回戦の結果が未入力、または対戦者が未確定の場合は、対戦カードの枠だけを表示する`pending`状態とする
- 引き分けは結果値として保存しない。ただしUIではリーグと同じ見た目の無効ボタンを表示する
- UIでは対戦者名ボタンで勝者を選択し、選択中の同じボタンを再押下すると`unplayed`へ戻す。反対側のボタンを押下した場合は勝者を切り替える
- 最終カードの勝者が確定した場合、その参加者のドロー番号を優勝者番号として返す

結果変更により後続カードの対戦者が変わった場合は、対戦者が変わったカードとその子孫カードの結果、セットゲーム数を未入力へ戻し、旧対戦者に紐づく備考を削除する。対戦者が変わらないカードの結果・ゲーム数・備考は保持する。

`setScores`は試合形式に応じて1、3、5行へ正規化する。値は未入力を`null`、入力値を0以上の整数として保持し、スコア不足や競技ルール上の妥当性は検証しない。未入力行は表示時に`-`とする。後続セットを自動削除・自動ロックしない。

現在の結果が`unplayed`の場合だけ、1セットは1セット、3セットは2セット、5セットは3セットの勝敗が明確になったとき、スコアから勝者を推定する。片側だけのスコア入力では推定しない。手動結果がある場合は推定結果で上書きせず、後続のスコア変更で結果を変更・削除しない。

## 14.4 結果入力と生成状態

勝敗、セットゲーム数、備考は生成入力署名に含めない。結果・ゲーム数の入力だけでは`GeneratedDraw`を再生成せず、`updatedAt`だけを更新して保存する。

次の入力が変わってドローを再生成する場合は、新しい`GeneratedDraw`と未入力状態の`matches`を作成する。

- 種目、ドローサイズ、シード数
- 完全空行を除く名簿または参加者の生成対象フィールド
- シード位置、BYE位置、選手配置順序、乱数シード

結果、ゲーム数、または備考が存在する場合の自動再生成はデータ消失を伴うため、UIでは再生成前にリセットされることを確認できる状態にする。大会名、開催日、会場、種目名、`DrawOutputOptions`の変更では結果・ゲーム数・備考を保持する。

明示的な「1回戦の組合せを再生成」は対戦カード画面でだけ実行できる。確定済み、または結果・ゲーム数・備考が1件でも存在する場合は操作を無効にし、無効理由をツールチップで案内する。実行時は新しい乱数シードでドロー全体と未入力状態の対戦カードを作成し、実行後も対戦カード画面に留まる。

## 14.5 トーナメント状態と完了

`Tournament.status`は`inProgress`または`completed`を保持し、対戦カードの確定状態は`matchSelectionStatus`で別に保持する。旧形式JSONで生成済みドローがあり確定状態がない場合は、既存結果を保護するため確定済みとして読み込む。`completed`への変更は生成済みドローが存在し、対戦カードが確定済みであれば許可し、試合結果の入力完了は条件にしない。ドローがない場合は`TOURNAMENT_DRAW_REQUIRED`、未確定の場合は`TOURNAMENT_MATCH_SELECTION_REQUIRED`を返す。

完了済みトーナメント表は読み取り専用とし、編集ステップへのアクセスはトーナメント表へリダイレクトする。トーナメント表の`編集を再開`で確認後に`status`を`inProgress`へ戻し、`GeneratedDraw`、結果、ゲーム数、備考、乱数シードは変更しない。完了操作と再開操作は通常の大会更新と同じ保存キューを経由する。

IndexedDBから既存トーナメントを読み込む際、`generatedDraw.matches`が未定義または空配列の場合は、`slots`と試合形式から未実施状態の対戦カードを実行時に補完する。補完時に大会名、参加者、結果、ゲーム数、備考、ドローID、乱数シードは変更しない。

## 14.6 生成時入力署名と自動再生成

`generationInputSignature` は、次の値を順序が安定した形へ正規化し、決定的に直列化して作成する。

- `matchType`、`drawSize`、`seedCount`
- 完全空行を除いた `entrants` の順序と、生成に使用する全フィールド
- シード位置、BYE位置、選手配置順序、乱数シードを含む `DrawOptions`

大会名、開催日、会場、種目名などの表示情報と `DrawOutputOptions` は署名へ含めない。生成済みドローがある場合を「生成済み」、ない場合を「未生成」とする。`status === "completed"`の場合はドローの有効性にかかわらず状態表示を「完了」とし、編集導線は読み取り専用のトーナメント表へ限定する。

初回生成前は入力変更だけで生成しない。初回生成に成功した時点で採用した乱数シードを `DrawOptions.randomSeed` と `GeneratedDraw.randomSeed` の両方へ保存する。初回生成後に署名が変化した場合は、保存した乱数シードを使用して自動再生成し、生成済み状態を維持する。

入力検証でエラーになった場合は `generatedDraw` を削除して未生成とするが、`DrawOptions.randomSeed` は保持する。参加者行の削除によって旧ドローの参照整合性を保てない場合も同様とする。入力を修正して有効な状態へ戻した時点で、保持している乱数シードを使って自動再生成し、生成済みへ戻す。したがって、初回生成後にユーザーによる明示的な再生成を必須とするタイミングは設けない。完全空行の追加・削除、表示情報、`DrawOutputOptions` の変更は署名を変化させず、生成済みドローをそのまま保持する。

生成時入力署名がない既存データは有効な生成結果として読み込み、最初の編集時に編集前の入力から署名を補完する。署名が不一致の個別大会JSONは生成済みドローを復元せず、未生成として追加する。

---

## 15. JSONエクスポート

## 15.1 推奨関数

```ts
function exportTournamentToJson(tournament: Tournament, exportedAt: string): string;
function exportAllTournamentsToJson(tournaments: readonly Tournament[], exportedAt: string): string;
```

時刻を引数で受け取り、同じ入力から同じJSONを生成できる純粋関数に寄せる。

## 15.2 個別大会JSON

個別大会JSONは、選択した1大会の共有、複製、不具合調査に使用する。

```ts
type TournamentExport = {
  schemaVersion: 1;
  exportedAt: string;
  tournament: Tournament;
};
```

## 15.3 全大会バックアップJSON

全大会バックアップJSONは、IndexedDBに保存されている全大会のバックアップと、別PC・別ブラウザへの移行に使用する。

```ts
type TournamentBackup = {
  schemaVersion: 1;
  exportedAt: string;
  tournaments: Tournament[];
};
```

要件は以下。

- 1ファイルに全大会を含める
- 各大会のID、参加者ID、生成済みドローのIDと参照関係を保持する
- 生成オプション、出力形式オプション、生成済みドロー、乱数シード、作成日時、更新日時を欠落させない
- 配列順は一覧表示時の順序を保持する
- インデント付きUTF-8 JSONとして出力する
- 大会が0件の場合も、空の `tournaments` 配列を持つ有効なバックアップとして出力できる

---

## 16. JSONインポート / 復元

JSONの解析・検証と、IndexedDBへの反映を分離する。解析・検証段階では保存済みデータを変更しない。

## 16.1 推奨関数

```ts
type JsonImportKind = "singleTournament" | "allTournamentsBackup";

type ParsedJsonImport =
  | { kind: "singleTournament"; tournament: Tournament }
  | { kind: "allTournamentsBackup"; backup: TournamentBackup };

type JsonImportIssue = {
  code: string;
  message: string;
  path?: string;
  tournamentId?: string;
};

type JsonImportParseResult = {
  parsed?: ParsedJsonImport;
  errors: JsonImportIssue[];
  warnings: JsonImportIssue[];
};

type RestoreAllResult =
  | { state: "success"; restoredCount: number }
  | { state: "error"; error: JsonImportIssue };

function parseJsonImport(jsonText: string): JsonImportParseResult;
function cloneImportedTournament(tournament: Tournament, now: string): Tournament;
async function restoreAllTournaments(
  backup: TournamentBackup,
  repository: TournamentRepository,
): Promise<RestoreAllResult>;
```

`parseJsonImport` はJSON形状から個別大会JSONと全大会バックアップJSONを判別する。既存互換のため、個別大会ではラッパーのない `Tournament` も読み込み対象に含めてよい。

## 16.2 個別大会インポート

- 既存大会を変更せず、新しい大会として追加する
- Tournament ID、Entrant ID、GeneratedDraw IDを新規採番する
- `GeneratedDraw.tournamentId` と `DrawSlot.entrantId` は、新しいIDへ対応付けて更新する
- `TournamentMatch.id` と、後続カードが保持する`source.matchId`も新しいIDへ対応付けて更新する
- ID再採番前に生成済みだったデータは、新しいTournament IDとEntrant IDを反映した入力から生成時入力署名を再計算する。入力と署名が不一致の生成済みドローは復元せず、未生成として追加する
- createdAt / updatedAt はインポート時点で更新する
- generatedDrawが含まれている場合は、参照整合性を保った状態で復元する
- 旧形式の`GeneratedDraw`に`matches`がない場合は、`slots`から未実施状態の全回戦カードを補完する
- `schemaVersion` が未設定の既存個別JSONは、検証可能な範囲で読み込む

## 16.3 全大会バックアップ復元

- `schemaVersion` が対応範囲内であることを必須とする
- 全大会と、各大会内のID参照を事前検証する
- 復元時は大会ID、参加者ID、生成済みドローのID、対戦カードIDと参照関係を保持する
- 現在の全大会をバックアップ内の全大会で置き換える
- 初期PoCではマージ復元を行わない
- 0大会のバックアップも復元可能とするが、現在の全大会が削除されることを明示して確認を必須とする

全置換は `TournamentRepository.replaceAll` の1トランザクションで行う。同一トランザクション内で既存全件の削除、バックアップ全件の保存、件数とID集合の再読込確認を行い、不一致またはリクエスト失敗時はabortする。全確認後にtransactionがcompleteした場合だけ成功を返す。

## 16.4 エラー例

| code | 条件 | message |
|---|---|---|
| `JSON_PARSE_ERROR` | JSONとして解析不能 | JSONを解析できません |
| `IMPORT_KIND_UNKNOWN` | 個別大会・全大会バックアップのどちらでもない | 対応していないJSON形式です |
| `IMPORT_MISSING_TOURNAMENT` | 個別大会JSONにtournamentが存在しない | トーナメントデータが見つかりません |
| `IMPORT_INVALID_TOURNAMENT` | Tournamentとして不正 | トーナメントデータが不正です |
| `BACKUP_SCHEMA_UNSUPPORTED` | schemaVersionが未対応 | このバックアップ形式には対応していません |
| `BACKUP_DUPLICATE_ID` | バックアップ内でIDが重複 | バックアップ内のIDが重複しています |
| `BACKUP_REFERENCE_INVALID` | generatedDraw、DrawSlot、TournamentMatch等の参照先が不正 | バックアップ内の参照関係が不正です |
| `BACKUP_RESTORE_FAILED` | IndexedDBの全置換またはトランザクション内確認に失敗 | バックアップを復元できませんでした。元のデータは保持されています |

---

## 17. ローカル保存

## 17.1 保存層インターフェース

```ts
interface TournamentRepository {
  list(): Promise<Tournament[]>;
  get(id: string): Promise<Tournament | undefined>;
  save(tournament: Tournament): Promise<void>;
  delete(id: string): Promise<void>;
  duplicate(id: string): Promise<Tournament>;
  replaceAll(tournaments: readonly Tournament[]): Promise<void>;
}
```

UIとReact Providerは永続化に `TournamentRepository` を使用し、IndexedDB APIとlocalStorageを直接操作しない。JSON変換とダウンロードは保存層と分離したJSON入出力サービスを経由する。

## 17.2 IndexedDB構造

ブラウザ内の正式な保存先はIndexedDBとする。

```ts
const DATABASE_NAME = "draw-lab";
const DATABASE_VERSION = 1;
const TOURNAMENT_STORE = "tournaments";
const METADATA_STORE = "metadata";
```

| object store | key | 用途 |
|---|---|---|
| `tournaments` | `Tournament.id` | 大会単位の保存、取得、更新、削除 |
| `metadata` | 文字列キー | schemaVersion、localStorage移行完了状態 |

`tournaments` には `updatedAt` のインデックスを用意し、一覧は更新日時の降順で取得する。1大会の更新で全大会を再書き込みしない。

`replaceAll` は `tournaments` storeを対象とする1つのreadwriteトランザクション内で、既存全件の削除、バックアップ全件の保存、件数とID集合の再読込確認を行う。書き込み失敗または確認不一致の場合はtransactionをabortし、completeイベント後にのみ処理成功とする。

## 17.3 localStorageからの移行

既存実装のlocalStorageキーは以下。

```text
drawlab:tournaments
```

初期化時の処理順序は以下。

1. IndexedDBを開く
2. `metadata` の移行完了状態を確認する
3. 未移行の場合のみlocalStorageを読み込む
4. JSONを解析し、全Tournamentを検証・正規化する
5. 1トランザクションで全件をIndexedDBへ保存する
6. IndexedDBから再読込し、件数とID集合が一致することを確認する
7. 移行完了状態を保存する
8. 移行成功後に限り、旧localStorageキーを削除してよい

解析、検証、保存、再読込確認に失敗した場合は移行完了状態を保存せず、localStorageの元データを保持する。失敗を空一覧へ変換せず、UIへエラーとして返す。

## 17.4 初期化・保存状態

```ts
type StorageStatus = "loading" | "ready" | "saving" | "error";
```

- `loading` 中は空状態を表示しない
- UI更新は即時反映し、IndexedDB書き込みは順序を保証するキューで直列化する
- 古い保存処理が新しい編集内容を上書きしないよう、同一大会の保存順序を保証する
- 複数タブから同じ大会を更新した場合は、最後に完了したトランザクションを採用する。複数タブ間の編集マージと競合解決UIはPoC対象外とする
- 保存失敗時は `error` とし、未保存であることをユーザーへ通知する
- OPFSは本PoCの保存実装に含めない

## 17.5 PWA / Service Worker設計

PWA機能は、トーナメント生成ロジック、描画ロジック、IndexedDB保存層から分離する。Service Workerは公開アプリ資産を配信するための実行環境であり、`TournamentRepository` やJSON入出力サービスを呼び出さない。

### 17.5.1 正規Originと登録範囲

```ts
const CANONICAL_ORIGIN = "https://draw-lab.bamboosato.com";
const SERVICE_WORKER_URL = "/sw.js";
const SERVICE_WORKER_SCOPE = "/";
const MANIFEST_URL = "/manifest.webmanifest";
```

- 本番では正規Originの `/sw.js` を登録する
- Service Workerのscopeは `/` とし、React Routerの全画面URLを対象にする
- localhostは開発・テスト用Originとして扱い、本番のIndexedDBやService Workerと共有しない
- 開発サーバーではService Workerを登録しない、または本番相当ビルドの検証時だけ登録する
- `/manifest.webmanifest`、`/sw.js`、アイコンはSPAフォールバックではなく静的資産として返す

### 17.5.2 キャッシュ戦略

| リソース | 戦略 | キャッシュ可否 | 備考 |
|---|---|---|---|
| 画面ナビゲーション / `index.html` | network-first、失敗時にアプリシェルへフォールバック | 可 | 更新を検知し、オフライン起動を維持する |
| Manifest | network-first | 可 | 新しい名前・アイコン・表示設定を検知する |
| ハッシュ付きJS / CSS | cache-first | 可 | ビルド世代ごとに管理する |
| 公開アイコン・公開画像 | cache-first | 可 | `public/` の公開資産に限る |
| `/assets/*` 以外の未知のURL | 通常のネットワーク処理 | 原則不可 | APIやユーザーデータをアプリシェルに混ぜない |
| IndexedDBの大会データ | Service Workerから参照しない | 不可 | `TournamentRepository` の責務 |
| JSON本文・Blob URL・クリップボード内容 | Service Workerから参照しない | 不可 | ファイル入出力とUIの責務 |

Cache Storageに保存してよいのは、アプリの公開資産だけとする。参加者名簿、所属、地区、生成済みドロー、入力途中の状態、JSONバックアップは保存しない。Service Workerのキャッシュ世代を変更した場合は、不要な旧世代を削除する。

### 17.5.3 オフライン・更新状態

```ts
type PwaRuntimeState =
  | "unsupported"
  | "registering"
  | "ready"
  | "offline"
  | "updateAvailable"
  | "updating"
  | "error";
```

- `unsupported` は通常のWebアプリとして継続利用する。空の大会一覧へ置き換えない
- `ready` は通常の画面へ中立な完了メッセージを常時表示しない
- 通信断を検知した場合は `offline` とし、キャッシュ済みアプリシェルとIndexedDBの利用可否を区別して表示する
- 新しいService Workerを検知した場合は `updateAvailable` とし、ユーザー操作なしに `skipWaiting` やページ再読み込みを実行しない
- `storageStatus === "saving"` 中は更新適用を開始しない。保存完了後にユーザーが更新を選択できるようにする
- 更新適用に失敗した場合は `error` とし、現行アプリとIndexedDBデータを保持して再試行できるようにする
- 初回起動がオフラインでアプリシェル未取得の場合は、保存データがない状態と混同しないエラーとして扱う

### 17.5.4 インストールガイダンス状態

PWAインストール案内は、Service Workerの更新状態やIndexedDBの保存状態とは別に管理する。画面表示だけでは標準インストールダイアログを開かず、ユーザー操作を必須とする。

```ts
type InstallGuideMode =
  | "hidden"
  | "browserInstall"
  | "iosManual"
  | "unsupported";

type InstallGuideState = {
  mode: InstallGuideMode;
  isStandalone: boolean;
  canPrompt: boolean;
  isDismissed: boolean;
};
```

- `display-mode: standalone` を基本に判定し、iPhone・iPadでは `navigator.standalone` を補助的に使用する
- standalone起動中は `hidden` とし、インストールイベントを受信していても案内を表示しない
- 非standaloneのiPhone・iPadは `iosManual` とし、「インストール方法」から手動手順を表示する

### 17.5.5 文書タイトル

- トーナメントの編集中・表示中は文書タイトルを `DrawLab　トーナメント＞大会名｜状態`、リーグの編集中・表示中は `DrawLab　リーグ＞大会名｜状態` とし、状態には「編集中」「運用中」「完了」を表示する。
- 大会名が未入力の個別画面では大会名部分を省略し、`DrawLab　トーナメント｜状態` または `DrawLab　リーグ｜状態` とする。トーナメント一覧は `DrawLab　トーナメント`、リーグ一覧は `DrawLab　リーグ`、ホームは `DrawLab` とする。復元画面など種別付きの一覧外画面は、該当する種別のタイトルを使用する。
- 大会名の前後の空白だけは除去してから表示し、空白だけの大会名は未入力として扱う。
- standaloneのPWAでは文書タイトルがWindowsのタイトルバーに反映される。タイトルバー上の位置、文字サイズ、長いタイトルの省略方法はOSおよびブラウザに委ねる。
- その他のブラウザで `beforeinstallprompt` を受信した場合はイベントを保持して `browserInstall` とする
- `prompt()` は「インストール」押下を契機に1回だけ呼び、イベントを再利用しない
- `appinstalled` の受信またはインストール成功後は `hidden` とする
- 標準ダイアログのキャンセル、または案内の「閉じる」操作時刻を `localStorage` に保存し、30日間は `isDismissed` とする
- `localStorage` が利用できない場合はセッション内状態だけで抑制し、画面をエラーにしない
- 端末やブラウザを確実に判定できず、実行可能なインストール手段も説明できない場合は `unsupported` とし、案内を表示しない

Service Workerの実装を変更しても、`generateDraw()`、`buildBracketViewModel()`、`TournamentRepository` の公開責務は変更しない。

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
  matchType: "singles" | "doubles" | "team";
  drawSize: DrawSize;
  outputOptions: DrawOutputOptions;
  rows: BracketRow[];
  matches: ResolvedTournamentMatch[];
  scoreDisplays: BracketScoreDisplay[];
  championDrawPosition?: number;
};

type BracketRow = {
  position: number;
  label: string;
  seedNo?: number;
  teamLabel?: string;
  region?: string;
  isBye: boolean;
};

type BracketScoreDisplay = {
  matchId: string;
  mode: "winner-loser-games" | "participant-set-wins";
  winnerValue?: number;
  loserValue?: number;
  participantAValue?: number;
  participantBValue?: number;
};
```

レンダラーは `Tournament` と `GeneratedDraw` を直接解釈しすぎず、ViewModelを受け取って描画する。

`matches`の解決結果をもとに、レンダラーは勝者が通過した区間だけへ勝者用の濃いオレンジ色（`#c2410c`）と少し太い線を適用する。勝者線は参加者側の横線、回戦の縦線、次回戦側の横線を一続きの経路として強調する。既存のU字型接続線を一つのパスとして全体着色せず、参加者側、接続部、次回戦側の区間を対戦カードに対応付ける。`championDrawPosition`がある場合だけ、決勝の優勝線の上へ同じ色のNo.を表示する。

`scoreDisplays`は入力済みのセットゲーム数から派生させ、`matchId`で`matches`の試合に対応付ける。1セットマッチは`mode = "winner-loser-games"`とし、選択された勝者のゲーム数を`winnerValue`、敗者のゲーム数を`loserValue`へ設定する。レンダラーは勝者線の上に`winnerValue-loserValue`の順で1つの文字列を表示する。3セットマッチ・5セットマッチは`mode = "participant-set-wins"`とし、各セットのゲーム数を比較して取得セット数を`participantAValue`・`participantBValue`へ設定する。レンダラーは勝敗で値を入れ替えず、A側・B側の対戦者行に対応する位置へ表示する。未実施、BYE、スコア未入力、またはセット数を算出できない試合は`scoreDisplays`へ含めない。手動で選択された勝敗とスコアが一致しない場合も、表示用の値や勝敗を自動修正しない。

対戦結果、備考、途中回戦の対戦カードそのものは、スコア表示用の派生値を除いてViewModelの表示対象に含めない。

## 18.4 ホーム画面ViewModel

ホーム画面は、`TournamentProvider` と `LeagueProvider` の既存データから表示用ViewModelを生成する。ViewModelは保存せず、ReactコンポーネントやRepositoryから分離した純粋関数として実装する。

```ts
type HomeRecentItem = {
  kind: "tournament" | "league";
  id: string;
  title: string;
  dateLabel: string;
  statusLabel: string;
  updatedAt?: string;
  resumePath: string;
};

type HomeViewModel = {
  tournament: {
    total: number;
    operating: number;
    editing: number;
    completed: number;
  };
  league: {
    total: number;
    editing: number;
    operating: number;
    completed: number;
  };
  recentItems: HomeRecentItem[];
};

function buildHomeViewModel(
  tournaments: readonly Tournament[],
  leagues: readonly League[],
  integrations: readonly TournamentIntegrationRecord[],
): HomeViewModel;
```

実装ルールは以下とする。

- トーナメントの状態判定は、`status === "completed"`を完了、`matchSelectionStatus === "confirmed"`かつ連携情報を含む既存のドロー有効性判定が真の項目を運用中、それ以外を編集中へ集計する
- リーグの編集中・運用中・完了は、リーグ一覧画面と同じ判定を使用する
- 大会名のフォールバックは、トーナメントを「無題のトーナメント」、リーグを「無題のリーグ」とする。開催日未設定は「未設定」とする
- `updatedAt` を日時として解釈できない項目は最近更新一覧の末尾に置く。同日時の場合は入力順を維持する
- 最近更新項目は種別をまたいで統合し、最大5件とする。最大件数は画面幅によって変更しない
- `resumePath` は現在のフロー判定結果から生成し、表示コンポーネントで条件分岐しない

## 18.5 最近更新項目の再開先

ホーム画面の「開く」は、次の純粋関数で一意に決定する。

```ts
function getTournamentResumePath(
  tournament: Tournament,
  integration?: TournamentIntegrationRecord,
): string;

function getLeagueResumePath(league: League): string;
```

トーナメントは、完了済みなら読み取り専用の`/preview`へ遷移する。完了前は基本情報、名簿、オプションの順に最初の未完了ステップへ遷移し、現在のドローが有効な場合は`/preview`へ遷移する。生成済みドローが入力変更により無効な場合は、再生成可能なオプション設定へ遷移する。対戦カード画面は既存の編集導線として維持するが、ホームの単一再開先には使用しない。

リーグは、基本情報、名簿・選出、グループ設定、対戦カードの順に最初の未完了ステップへ遷移する。対戦カード確定済みまたは完了済みの場合はリーグ表へ遷移する。完了済みリーグは読み取り専用のリーグ表を再開先とする。

既存の `getTournamentStepAccess`、`getLeagueStepAccess`、状態判定関数を構成要素として利用し、ホーム専用の判定規則を別に持たせない。再開先関数には未入力、部分入力、生成済み、生成結果の陳腐化、完了済みのケースを与えて単体テストする。

## 19. テスト観点

## 19.1 validation.test.ts

| ケース | 期待結果 |
|---|---|
| 参加者0件 | `NO_ENTRANTS` エラー |
| 参加者数 > drawSize | `ENTRANTS_EXCEED_DRAW_SIZE` エラー |
| シングルスで選手名なし | `PLAYER_NAME_REQUIRED` エラー |
| シード番号が文字列 | `SEED_NO_INVALID` エラー |
| 同一選手名あり | `DUPLICATE_PLAYER_NAME` 警告 |
| ダブルスで選手名1・選手名2の不足 | `DOUBLES_PLAYER_MISSING` エラー |

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

## 19.7.1 tournamentMatches.test.ts

対戦カードと勝ち上がりのテストは、機能、データ、UI連携、異常系、境界値、状態遷移を分け、各ケースの意図を明確にする。

| 観点 | ケース | 意図 | 期待結果 |
|---|---|---|---|
| 機能・正常系 | 1回戦のA勝を入力 | 勝者が次回戦へ伝播することを確認する | 対応する2回戦のA側に参加者Aが解決される |
| 機能・正常系 | 2回戦、決勝まで勝敗を入力 | 複数回戦の連鎖を確認する | 最終勝者が正しく解決される |
| 機能・正常系 | 1セットマッチで両者のゲーム数を入力 | スコアの省スペース表示を確認する | 勝者線の上に勝者-敗者順のゲーム数が表示される |
| 機能・正常系 | 3セット・5セットマッチでセット結果を入力 | 取得セット数の表示を確認する | A側・B側の対戦者行に対応して取得セット数が表示される |
| 機能・正常系 | 1名対BYE | BYEを手動結果として扱わないことを確認する | 実参加者が自動で次回戦へ進み、入力操作は無効になる |
| 機能・正常系 | 決勝結果を入力 | 優勝確定条件を確認する | `championDrawPosition`が返る |
| UI連携 | 引き分けボタンを確認 | リーグと同じ表示を保ちつつ選択不可であることを確認する | ボタンは表示されるがdisabledで、結果は変化しない |
| UI状態 | 未確定で結果・ゲーム数・備考が未入力 | 確定前の編集と再生成可能な状態を確認する | 勝敗・ゲーム数・備考は無効、`1回戦の組合せを再生成`は有効になる |
| UI状態 | 確定後、または結果・ゲーム数・備考が入力済み | 試合開始後の組合せ変更とデータ消失を防ぐことを確認する | 再生成ボタンが無効になり、ツールチップに理由が表示される |
| 状態遷移 | 結果・備考が未入力で再生成 | 新しい組合せを確認できることを確認する | 新しい乱数シードでドローと対戦カードが更新され、対戦カード画面に留まる |
| 状態遷移 | 前回戦が未入力 | 未確定カードの表示条件を確認する | 次回戦は枠だけ表示され、結果入力できない |
| 状態遷移 | 前回戦の結果を変更 | 古い勝者の残存を防ぐことを確認する | 対戦者が変わる後続カードの結果・備考がリセットされる |
| データ | 結果・ゲーム数・備考だけを更新 | 生成状態と試合状態を分離できていることを確認する | 生成入力署名は変わらず、ドローは再生成されない |
| 機能・境界値 | 1、3、5セットの完全なスコアを入力 | 試合形式ごとの自動勝者判定を確認する | 1セットは1勝、3セットは2勝、5セットは3勝で、現在が未実施の場合だけ勝者が選択される |
| 機能・正常系 | 手動結果後にスコアを変更 | 手動選択を保護することを確認する | 勝敗は自動変更・削除されない |
| 機能・異常系 | 片側だけ、または不完全なスコアを入力 | 不完全入力での誤判定を防ぐことを確認する | 自動選択されず、入力値は許容される |
| UI表示 | A側・B側の勝者を入れ替える | 1セットの表示順が勝者基準であることを確認する | 勝者線の上のゲーム数が常に勝者-敗者順になる |
| UI表示 | 手動勝敗とスコアが一致しない | 表示時の自動修正を防ぐことを確認する | 手動勝敗を維持し、スコア入力も変更しない |
| UI表示 | 画面プレビューとPDF／印刷を確認する | 表示経路ごとの不一致を防ぐことを確認する | スコアの位置・順序が一致する |
| 状態遷移 | 詳細入力をOFFにする | ゲーム数の明示的なリセットを確認する | 確認後に全セットが未入力へ戻る |
| 境界値 | 4、128ドロー | 最小・最大対象サイズを確認する | それぞれ2回戦、7回戦のカードが生成される |
| 異常系 | 未確定カードへ結果を指定 | 不正な状態遷移を防ぐことを確認する | 更新されず、エラーまたは無効操作として扱われる |
| 異常系 | 不正なmatchIdまたは参照 | 存在しないカードの更新を防ぐことを確認する | 状態を変更せず、検証エラーになる |

## 19.7.2 tournament completion

| 観点 | ケース | 意図 | 期待結果 |
|---|---|---|---|
| 機能・正常系 | 試合結果未入力の確定済み生成済みドローを完了 | リーグと同じ完了条件と状態保存を確認する | `status`が`completed`になる |
| 機能・異常系 | ドローなしで完了 | 未生成大会の完了を防ぐ | エラーを返し、`status`と試合データを変更しない |
| 状態遷移 | 完了済みの編集再開を確認 | 読み取り専用から編集可能状態への遷移を確認する | `status`が`inProgress`になり、結果・ゲーム数・備考・組合せ・乱数シードを保持する |
| 状態遷移 | 編集再開をキャンセル | 意図しない状態変更を防ぐ | `status`と保存データが変化しない |
| UI | 完了済みの対戦カードへ直接アクセス | 完了後の編集禁止を確認する | トーナメント表へリダイレクトする |
| UI | 完了済みの一覧・ホーム | 状態表示の整合を確認する | `完了`が表示され、再開先がトーナメント表になる |

## 19.8 tournamentStorage.test.ts

テスト観点は、機能、データ、異常系・境界値、状態遷移に分ける。

| 観点 | ケース | 期待結果 |
|---|---|---|
| 機能・正常系 | 大会の追加、更新、取得、削除 | 対象大会だけが変更される |
| 機能・正常系 | 複数大会を保存して再初期化 | 更新日時順の一覧を復元できる |
| データ | generatedDraw、対戦カード、勝敗、ゲーム数、備考、確定状態、試合形式、乱数seed、出力形式を含む大会 | 保存前後で欠落しない |
| 移行・正常系 | 有効なlocalStorage全大会 | IndexedDBへ全件移行し、移行完了になる |
| 移行・異常系 | localStorageのJSON破損 | IndexedDBを空データ扱いせず、移行元を保持してエラーになる |
| 異常系 | IndexedDB書き込み失敗 | 保存済みデータを壊さず `error` になる |
| 状態遷移 | `loading` 中 | 空状態を表示可能な結果として返さない |
| 競合 | 同一大会を短時間に連続保存 | 最後の更新内容が残る |
| 境界値 | 0件、1件、多数大会 | 一覧、保存、削除が正しく完了する |

## 19.9 jsonBackup.test.ts

| 観点 | ケース | 期待結果 |
|---|---|---|
| 個別・正常系 | 個別大会JSONをインポート | 新IDへ再採番され、関連IDも整合した大会が追加される |
| バックアップ・正常系 | 複数大会をエクスポートして全置換復元 | 全大会とID参照が同一内容で復元される |
| データ | generatedDraw、対戦カード、勝敗、備考、乱数seed、作成・更新日時 | エクスポート・復元後も保持される |
| 互換性 | 対戦カードがない旧JSON | 既存データを失わず新機能へ移行できることを確認する | 配置枠から未実施の対戦カードが補完される |
| 参照整合性 | 個別JSONインポート | 前回戦カード参照の再採番を確認する | 新しいmatch IDと参照先が一貫する |
| 境界値 | 0大会のバックアップ | 有効なJSONを出力でき、確認後に0件へ全置換できる |
| 異常系 | JSON構文不正 | `JSON_PARSE_ERROR` となり保存済みデータは変化しない |
| 異常系 | 未対応schemaVersion | `BACKUP_SCHEMA_UNSUPPORTED` となり全置換しない |
| 異常系 | 重複IDまたは不正参照 | 検証エラーとなり全置換しない |
| トランザクション | 全置換の途中で保存失敗 | transactionがabortされ、復元前の全大会が残る |
| 再現性 | 同じ入力とexportedAt | 同じJSON文字列を返す |

## 19.10 ブラウザ結合テスト観点

修正範囲に応じて対象ケースを選び、全E2Eを既定としない。IndexedDB実装または全置換復元を変更した場合は、少なくとも対象フローを実ブラウザで確認する。

| 観点 | ケース | 期待結果 |
|---|---|---|
| 環境差異 | 対象Chromium系ブラウザとFirefox | 保存、再読込、全置換復元が同じ結果になる |
| オリジン | localhostと本番HTTPS | オリジンごとに独立して保存される |
| プライベート利用 | IndexedDB利用不可または制限時 | 空一覧にせず、保存不可を通知する |
| 容量不足 | QuotaExceeded相当 | 既存大会を保持し、保存失敗を通知する |
| 再読込 | 保存完了後にページ再読込 | 一覧と大会詳細が復元される |
| 複数タブ | 同一大会を別タブで更新 | 最後に完了したトランザクションの内容が、破損なく残る |
| PC移行 | PC Aで全件出力しPC Bで全置換復元 | 全大会数、ID、generatedDraw、乱数seedが一致する |

テスト結果には、実施ブラウザ、対象ケースを選んだ理由、未実施範囲、失敗時のログと再現手順を記録する。

## 19.11 PWAブラウザ結合テスト観点

PWA変更では、機能、非機能、データ、UIの観点を先に分け、正常系、異常系、境界値、状態遷移を切り分ける。全E2Eを既定とせず、Service Worker、Manifest、配信rewrite、IndexedDB、更新処理に影響する対象ケースを優先する。

| 観点 | 区分 | ケース | 期待結果 |
|---|---|---|---|
| 機能 | 正常系 | 正規OriginでManifestを取得してインストール導線を確認 | `name`、`short_name`、`start_url`、`scope`、`display`、192px / 512pxアイコンが認識される |
| 機能 | 正常系 | オンラインで初回起動後に通信を切断して再起動 | アプリシェルが起動し、IndexedDBの大会一覧を表示できる |
| 機能 | 状態遷移 | オンライン → オフライン → オンライン | `offline` 表示、復帰、更新確認が順序どおりに行われる |
| 機能 | 状態遷移 | 新Service Worker検知 → 後で → 更新 | 編集中は画面を再読み込みせず、ユーザー選択後だけ更新する |
| 機能 | 異常系 | `/tournaments/new`、`/import`、大会編集URLを直接再読み込み | SPAフォールバックで404にならず、対象画面を表示する |
| 非機能 | 環境差異 | Chrome / Edgeデスクトップ、Android Chrome、iOS Safari | PWAインストール可否を含む差異を記録し、通常Web利用は継続できる |
| 非機能 | 異常系 | Service Worker登録失敗、Manifest取得失敗、初回オフライン | 通常Webアプリとして動作し、空一覧や成功扱いにしない |
| 非機能 | 境界値 | キャッシュ世代更新、古いService Workerが残った状態 | 新資産を取得し、不要な旧キャッシュを残さない |
| データ | 正常系 | オフライン中に入力・生成・保存・再読込 | IndexedDBの大会データが欠落せず、画面再読込後も復元される |
| データ | 異常系 | Cache Storageの内容を検査 | 名簿、所属、地区、generatedDraw、JSON本文が存在しない |
| データ | 境界値 | 0大会、1大会、多数大会でオフライン起動 | 空状態と保存失敗を混同せず、件数が一致する |
| データ | Origin | 正規Origin、localhost、別ホストを順に利用 | 保存領域とService WorkerがOriginごとに分離される |
| UI | 正常系 | standalone起動、320px幅、100% / 125%表示 | ヘッダー、操作、保存状態、横スクロールが破綻しない |
| UI | 異常系 | 保存中に更新通知の「更新」を押す | 更新を保留し、未保存データを破棄しない |
| UI | 正常系 | オフラインでJSON入出力とブラウザ印刷 | ファイル操作と印刷がネットワークなしで実行できる |

実行結果には、実施ブラウザ・OS・ビルド識別子・通信切替方法・選定理由・未実施範囲・ログ・再現手順を記録する。同一実機に対するブラウザテストは並列実行しない。

---

## 19.12 ホーム画面ViewModelテスト観点

ホーム画面の表示用ロジックは、UIや保存層をモックせずに純粋関数としてテストする。

| 観点 | ケース | 意図 |
|---|---|---|
| 件数 | 0件、片方のみ、両方あり | 保存データの有無にかかわらずカードと件数が正しく構成されることを確認する |
| 状態 | トーナメントとリーグの編集中・運用中・完了 | 各一覧と同じ状態判定になることを確認する |
| 連携 | リーグ由来トーナメントの連携情報あり・なし | 運用中判定に連携情報を反映し、誤集計しないことを確認する |
| 最近更新 | 種別混在、6件以上、同日時 | 種別をまたいだ降順、最大5件、同値時の入力順を確認する |
| 日時異常 | `updatedAt` の欠損・不正値 | ホーム全体を停止せず、不正項目を末尾へ置くことを確認する |
| 表示補完 | タイトル・開催日の未入力 | 種別ごとの代替表記が一覧画面と一致することを確認する |
| 再開先 | 未入力、部分入力、生成済み、陳腐化、完了済み | 「開く」が最初の未完了ステップ、プレビュー、リーグ表へ正しく遷移することを確認する |

## 19.13 PWAインストールガイダンスのテスト観点

- standalone起動中、通常ブラウザ、`beforeinstallprompt` 対応ブラウザ、iPhone・iPad、未対応ブラウザを分けて確認する
- `prompt()` がユーザー操作時に1回だけ呼ばれ、ページ表示時には呼ばれないことを確認する
- `appinstalled`、標準ダイアログのキャンセル、「閉じる」操作で表示状態と30日間の抑制状態が正しく変化することを確認する
- `localStorage` の禁止、読み取り失敗、破損値でも通常利用が継続することを確認する
- 手順ダイアログのフォーカス移動、フォーカストラップ、閉じた後の操作元へのフォーカス復帰を確認する
- Service Workerの更新通知、オフライン表示、IndexedDB保存状態とインストール案内を混同しないことを確認する

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
9. src/domain/tournamentMatchFlow.ts + tests
10. src/storage/tournamentRepository.ts + IndexedDB実装 + tests
11. src/storage/localStorageMigration.ts + tests
12. src/storage/jsonExport.ts / jsonImport.ts / jsonBackup.ts + tests
13. src/renderers/svgBracketRenderer.ts
14. UI components
15. print CSS
16. public/manifest.webmanifest + PWAアイコン
17. vite.config.ts + Service Worker生成・登録
18. 本番ホスティングのSPAフォールバック
19. 更新通知と更新適用制御
20. PWA対象ブラウザ結合テスト
21. ホーム画面ViewModel・状態集計・再開先判定 + tests
22. ホーム画面、AppShell、ルーティング変更 + tests
23. PWAインストールガイダンスの状態管理・UI + tests
24. ホーム画面のレスポンシブ・アクセシビリティ・オフラインE2E
25. `docs/requirements.md`、`docs/screen-spec.md`、README、CHANGELOGの整合性確認
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
- 回戦ごとの対戦カードが生成され、前回戦の勝者が後続カードへ反映される
- BYE対戦が自動勝ち上がりとなり、実試合だけが結果入力対象になる
- 引き分けボタンが表示されるが、結果として選択・保存できない
- 決勝勝者のドロー番号を取得でき、勝者経路を描画へ渡せる
- 結果と備考だけの変更で生成入力署名が変化しない
- IndexedDBへ大会単位で保存し、再初期化後に全大会を復元できる
- localStorageからIndexedDBへ既存データを安全に移行できる
- 個別大会JSONを新しい大会として追加インポートできる
- 全大会バックアップJSONをエクスポートできる
- 全大会バックアップを1トランザクションで全置換復元できる
- 不正JSONまたは復元失敗時に、復元前の全大会が保持される
- 正規OriginでManifestとService Workerを取得できる
- 初回オンライン起動後にオフラインでアプリシェルを起動できる
- オフライン中もIndexedDBの大会データを保持して利用できる
- Cache Storageにユーザーデータを保存しない
- 更新適用時に編集中・保存中のデータを破棄しない
- 画面URLの直接再読み込みがSPAフォールバックで成功する
- `buildHomeViewModel` がトーナメントとリーグの件数・状態・最近更新項目を一貫して生成する
- `getTournamentResumePath` と `getLeagueResumePath` が既存フロー判定に沿って再開先を返す
- ホーム画面用の表示データや状態をIndexedDB・JSONへ追加保存しない
- 不正な `updatedAt`、片方の保存領域のエラー、読み込み中の状態を空データと混同しない
- PWA起動状態、標準インストール、iPhone・iPad手動案内、30日間抑制を状態遷移として検証できる
- 主要ロジックにVitestの単体テストがある
