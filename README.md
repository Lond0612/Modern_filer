<div align="center">

# 🛸 Orbiter

**A fast, modern file explorer for Windows**

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![Platform](https://img.shields.io/badge/platform-Windows-lightgrey)
![License](https://img.shields.io/badge/license-ISC-green)

</div>

---

## ✨ Features

- **高速なファイル操作** — C言語バックエンドによる高速なディレクトリ一覧・ファイル操作
- **複数の表示モード** — 詳細・コンパクト・各サイズのアイコングリッド表示
- **ドラッグ＆ドロップ** — ファイルの移動・外部アプリへのD&D対応
- **クイックプレビュー** — Space キーで画像・テキストのインスタントプレビュー
- **カスタムテーマ** — ライト/ダーク計8種のプリセット + JSONによるユーザーテーマ
- **マウスサイドボタン対応** — 戻る/進むボタンでフォルダ履歴を操作
- **右クリックメニュー強化** — 新規作成・パスのコピー・プロパティ
- **ターミナル内蔵** — アプリ下部でコマンドを直接実行

## 🚀 Installation

1. [Releases](../../releases) ページから `Orbiter-1.0.0-win.zip` をダウンロード
2. ZIPを任意のフォルダに展開
3. `Orbiter.exe` を実行

> **⚠️ SmartScreen について**
>
> 初回起動時に「Windows によって PC が保護されました」というダイアログが表示される場合があります。
> これはコード署名なしのアプリに表示されるものです。
>
> **「詳細情報」をクリック → 「実行」ボタン** を押すと起動できます。

## 🖥️ System Requirements

- Windows 10 / 11 (64-bit)

## 📖 Usage

| 操作 | アクション |
|------|-----------|
| ダブルクリック | フォルダを開く / ファイルを既定アプリで開く |
| Space | 選択ファイルをプレビュー |
| F2 / クリック選択後にクリック | 名前の変更 |
| Ctrl+C / X / V | コピー / 切り取り / 貼り付け |
| Delete | 削除 |
| Alt+← / → | 戻る / 進む |
| マウスサイドボタン | 戻る / 進む |
| 右クリック（空白） | 新規作成・表示設定 |
| 右クリック（ファイル） | 各種操作・パスのコピー |

## 🎨 Themes

設定画面（⚙️ アイコン）からテーマを変更できます。
`data/themes/user_themes.json` を編集することでカスタムテーマを追加できます。

## 📦 Portable Mode

設定やテーマは `Orbiter.exe` と同じフォルダの `data/` 以下に保存されます。
フォルダごとコピーすれば別のPCでも同じ設定で使用できます。

## 📝 License

ISC License — see [LICENSE](LICENSE)
