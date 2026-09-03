# メルヘンフェスコーデ｜アイプリチャレンジマップ

2026年9月開催「メルヘンフェスコーデをゲット！ お店でアイプリチャレンジ」の開催店舗を、一覧と地図で確認できる非公式サイトです。

## 開く

`index.html` をブラウザで開くと静的版として使えます。

現在地取得と最新取得を安定して使う場合は、同梱サーバーで起動します。

```powershell
& 'C:\Users\USER\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' .\tools\local-server.mjs
```

起動後に `http://127.0.0.1:4173/` を開きます。

## 最新情報を取得

Vercel上ではヘッダー右上の更新ボタンが `/api/refresh` を呼び出し、公式ページから最新情報を取得します。

ローカルサーバー起動中も同じボタンで公式ページを再取得します。

手動更新する場合:

```powershell
& 'C:\Users\USER\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' .\tools\refresh-data.mjs
```

手動更新した結果を初期表示データとして残す場合は、生成された `event-data.json` と `data.js` をコミットします。

## データ元

- 店舗・大会情報: [公式の開催店舗検索ページ](https://aipri.jp/event/search.html?event_id=10)
- 緯度経度: 国土地理院 住所検索API
