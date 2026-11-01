# 投資組合風險報酬計算器：VS Code 本機執行

## 1. 安裝必要工具

- 安裝 Visual Studio Code：https://code.visualstudio.com/
- 安裝 Node.js 22（版本必須為 22.13.0 以上）：https://nodejs.org/

安裝完成後，重新開啟 VS Code。

## 2. 開啟專案

1. 將下載的 ZIP 解壓縮。
2. 在 VS Code 選擇「File → Open Folder」。
3. 選擇解壓縮後的 `portfolio-risk-return-calculator-vscode` 資料夾。
4. 選擇「Terminal → New Terminal」。

## 3. 確認 Node.js

在 VS Code 終端機輸入：

```bash
node -v
npm -v
```

`node -v` 應顯示 `v22.13.0` 或更新版本。

## 4. 安裝專案套件

第一次開啟專案時執行：

```bash
npm ci
```

完成後會產生 `node_modules` 資料夾。之後不需要每次重新安裝。

## 5. 啟動網站

```bash
npm run dev
```

終端機顯示 `Local: http://localhost:5173/` 後，在瀏覽器開啟：

http://localhost:5173/

若終端機顯示的連結不同，請以終端機實際顯示的網址為準。

## 6. 停止網站

在正在執行網站的終端機按：

```text
Control + C
```

## 7. 修改網頁

主要頁面程式位於：

```text
app/page.tsx
```

共用樣式位於：

```text
app/globals.css
```

儲存檔案後，瀏覽器通常會自動更新。

## 常見問題

### `node: command not found`

代表 Node.js 尚未安裝完成。請安裝 Node.js 22，並重新啟動 VS Code。

### `npm ci` 發生版本錯誤

先確認：

```bash
node -v
```

版本必須為 22.13.0 以上。

### 5173 連接埠被占用

Vite 會自動改用其他連接埠，例如 5174。請開啟終端機實際顯示的 Local 網址。

### macOS 顯示安全性或網路權限提示

允許 VS Code 或 Node.js 接受本機網路連線即可。這個網站的 CSV 計算在瀏覽器本機執行。
