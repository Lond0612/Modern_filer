/**
 * MouseManager: 矩形選択やドラッグ＆ドロップなどのマウス操作を管理するクラス
 */
class MouseManager {
    constructor() {
        this.isDragging = false;
        this.startX = 0;
        this.startY = 0;
        this.rectElement = null;
        this.marqueeStarted = false;
        this.initialSelection = new Set();
        this.isDraggingItem = false;
        this.draggedItem = null;
        
        // 矩形選択の対象となるコンテナ
        this.containerId = 'explorer-view';
        
        this.init();
    }

    init() {
        // 選択矩形要素の作成
        this.rectElement = document.createElement('div');
        this.rectElement.className = 'selection-rectangle';
        document.body.appendChild(this.rectElement);

        // イベントリスナーの登録
        document.addEventListener('mousedown', (e) => this.onMouseDown(e));
        document.addEventListener('mousemove', (e) => this.onMouseMove(e));
        document.addEventListener('mouseup', (e) => this.onMouseUp(e));
    }

    /**
     * ドラッグ開始判定
     */
    onMouseDown(e) {
        // 左クリックのみ対象
        if (e.button !== 0) return;

        // すでに何らかの入力要素やボタン、スクロールバー等の上でクリックされた場合は無視
        if (e.target.closest('button, input, .col-resizer, .resizer-h, .resizer-v, .context-menu, .dropdown-menu')) {
            return;
        }

        // ファイルエクスプローラー領域（またはその親のペイン）内かチェック
        // explorer-viewが中身に応じて縮んでいる場合があるため、file-paneも対象にする
        const isExplorer = document.getElementById('explorer-view').style.display !== 'none';
        const inFileArea = e.target.closest('.file-pane');
        if (!isExplorer || !inFileArea) return;

        // テーブルヘッダーの上でのクリックは無視
        if (e.target.closest('thead')) return;

        const item = e.target.closest('#file-list-body tr, .grid-item');
        const isContent = e.target.closest('.cell-content, .grid-content');
        
        // 【重要】文字やアイコンのある「実コンテンツ領域」の上であれば、矩形選択を開始しない
        // それ以外の隙間（セルのマージン部分など）であれば、アイテムの上であっても矩形選択を開始できる
        if (isContent) {
            this.isDraggingItem = true;
            this.draggedItem = item;
            return;
        }

        this.isDragging = true;
        this.startX = e.clientX;
        this.startY = e.clientY;
        this.marqueeStarted = false;
        this.isPureEmptySpace = true; // ここに来る = itemがnullなので常にtrue

        // ドラッグ開始時点での選択状態を保持
        this.initialSelection = new Set();
        if (e.ctrlKey) {
            document.querySelectorAll('.selected').forEach(el => {
                const name = el.dataset.name;
                if (name) this.initialSelection.add(name);
            });
        }

        // 余白クリックなので即座に初期化
        this.marqueeStarted = true;
        this.updateRect(this.startX, this.startY, 0, 0);
        this.rectElement.style.display = 'block';
        
        if (!e.ctrlKey) {
            this.clearSelection();
        }

        // テキスト選択を防止
        document.body.classList.add('no-select');
    }

    /**
     * ドラッグ中
     */
    onMouseMove(e) {
        if (!this.isDragging) return;

        const currentX = e.clientX;
        const currentY = e.clientY;

        const diffX = currentX - this.startX;
        const diffY = currentY - this.startY;
        
        // アイテムの上から開始した場合のみ、しきい値（5px）を設ける
        if (!this.marqueeStarted) {
            if (Math.abs(diffX) > 5 || Math.abs(diffY) > 5) {
                this.marqueeStarted = true;
                this.rectElement.style.display = 'block';
                
                if (!e.ctrlKey) {
                    this.clearSelection();
                }
            }
        }

        if (this.marqueeStarted) {
            const x = Math.min(this.startX, currentX);
            const y = Math.min(this.startY, currentY);
            const width = Math.abs(this.startX - currentX);
            const height = Math.abs(this.startY - currentY);

            this.updateRect(x, y, width, height);
            this.checkIntersection(x, y, width, height, e.ctrlKey);
        }
    }

    /**
     * ドラッグ終了
     */
    onMouseUp(e) {
        if (!this.isDragging) return;

        const wasMarquee = this.marqueeStarted;
        const currentX = e.clientX;
        const currentY = e.clientY;
        const diffX = Math.abs(currentX - this.startX);
        const diffY = Math.abs(currentY - this.startY);

        this.isDragging = false;
        this.isDraggingItem = false;
        this.draggedItem = null;
        this.marqueeStarted = false;
        this.rectElement.style.display = 'none';
        document.body.classList.remove('no-select');
        
        // 【選択解除の強化】
        // 矩形選択が開始されず（移動距離が短く）、かつクリック対象がアイテムではなかった場合
        if (!wasMarquee && diffX < 5 && diffY < 5) {
            const item = e.target.closest('#file-list-body tr, .grid-item');
            if (!item && !e.ctrlKey) {
                // ファイルエクスプローラー領域内であることを再確認
                const isExplorer = document.getElementById('explorer-view').style.display !== 'none';
                const inFileArea = e.target.closest('.file-pane');
                if (isExplorer && inFileArea && !e.target.closest('thead')) {
                    this.clearSelection();
                }
            }
        }
        
        // 矩形選択が行われた場合は通知
        if (wasMarquee && typeof onSelectionChanged === 'function') {
            onSelectionChanged();
        }
    }

    /**
     * 矩形の描画更新
     */
    updateRect(x, y, w, h) {
        this.rectElement.style.left = `${x}px`;
        this.rectElement.style.top = `${y}px`;
        this.rectElement.style.width = `${w}px`;
        this.rectElement.style.height = `${h}px`;
    }

    /**
     * 要素との交差判定
     */
    checkIntersection(rectX, rectY, rectW, rectH, isCtrl) {
        // 表示されている方のコンテナからアイテムを取得
        const isGrid = document.getElementById('file-grid').style.display !== 'none';
        const selector = isGrid ? '.grid-item' : '#file-list-body tr';
        const items = document.querySelectorAll(selector);
        
        items.forEach(item => {
            const box = item.getBoundingClientRect();
            
            // 交差判定
            const intersects = (
                rectX < box.right &&
                rectX + rectW > box.left &&
                rectY < box.bottom &&
                rectY + rectH > box.top
            );

            if (intersects) {
                item.classList.add('selected');
            } else {
                // Ctrlキーが押されていない場合、または初期選択に含まれていない場合のみ解除
                if (!isCtrl) {
                    item.classList.remove('selected');
                } else if (!this.initialSelection.has(item.dataset.name)) {
                    item.classList.remove('selected');
                }
            }
        });
        
        if (typeof onSelectionChanged === 'function') {
            onSelectionChanged();
        }
    }

    /**
     * 選択状態のクリア
     */
    clearSelection() {
        document.querySelectorAll('#file-list-body tr.selected, .grid-item.selected').forEach(el => {
            el.classList.remove('selected');
        });
        // renderer.js の選択変更通知を呼ぶ必要があるが、グローバルに公開されているか確認が必要
        if (typeof onSelectionChanged === 'function') {
            onSelectionChanged();
        }
    }
}

// グローバルインスタンスの作成
window.mouseManager = new MouseManager();
