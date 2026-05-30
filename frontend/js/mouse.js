// マウス操作（矩形選択など）を管理するクラス
class MouseManager {
    // マウス管理クラスを初期化する
    constructor() {
        this.isDragging = false;
        this.startX = 0;
        this.startY = 0;
        this.rectElement = null;
        this.marqueeStarted = false;
        this.initialSelection = new Set();
        this.isDraggingItem = false;
        this.draggedItem = null;
        this.containerId = 'explorer-view';
        this.init();
    }

    // 選択用矩形要素を作成し、各種マウスイベントを登録する
    init() {
        this.rectElement = document.createElement('div');
        this.rectElement.className = 'selection-rectangle';
        document.body.appendChild(this.rectElement);

        document.addEventListener('mousedown', (e) => this.onMouseDown(e));
        document.addEventListener('mousemove', (e) => this.onMouseMove(e));
        document.addEventListener('mouseup', (e) => this.onMouseUp(e));
    }

    // マウスボタン押下時の矩形選択またはドラッグ開始を処理する
    onMouseDown(e) {
        if (e.button !== 0) return;

        if (e.target.closest('button, input, .col-resizer, .resizer-h, .resizer-v, .context-menu, .dropdown-menu')) {
            return;
        }

        const isExplorer = document.getElementById('explorer-view').style.display !== 'none';
        const inFileArea = e.target.closest('.file-pane');
        if (!isExplorer || !inFileArea) return;

        if (e.target.closest('thead')) return;

        const item = e.target.closest('#file-list-body tr, .grid-item');
        const isContent = e.target.closest('.cell-content, .grid-content');
        const isSelected = item && item.classList.contains('selected');
        
        if (isContent || isSelected) {
            this.isDraggingItem = true;
            this.draggedItem = item;
            return;
        }

        this.isDragging = true;
        this.startX = e.clientX;
        this.startY = e.clientY;
        this.marqueeStarted = false;
        this.isPureEmptySpace = true;

        this.initialSelection = new Set();
        if (e.ctrlKey) {
            document.querySelectorAll('.selected').forEach(el => {
                const name = el.dataset.name;
                if (name) this.initialSelection.add(name);
            });
        }

        this.marqueeStarted = true;
        this.updateRect(this.startX, this.startY, 0, 0);
        this.rectElement.style.display = 'block';
        
        if (!e.ctrlKey) {
            this.clearSelection();
        }

        document.body.classList.add('no-select');
    }

    // マウスドラッグ中の選択矩形更新と交差判定を処理する
    onMouseMove(e) {
        if (!this.isDragging) return;

        const currentX = e.clientX;
        const currentY = e.clientY;

        const diffX = currentX - this.startX;
        const diffY = currentY - this.startY;
        
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

    // マウスボタンが離されたときのドラッグ終了と確定処理を行う
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
        
        if (!wasMarquee && diffX < 5 && diffY < 5) {
            const item = e.target.closest('#file-list-body tr, .grid-item');
            if (!item && !e.ctrlKey) {
                const isExplorer = document.getElementById('explorer-view').style.display !== 'none';
                const inFileArea = e.target.closest('.file-pane');
                if (isExplorer && inFileArea && !e.target.closest('thead')) {
                    this.clearSelection();
                }
            }
        }
        
        if (wasMarquee && typeof onSelectionChanged === 'function') {
            onSelectionChanged();
        }
    }

    // 選択矩形要素の位置とサイズを更新する
    updateRect(x, y, w, h) {
        this.rectElement.style.left = `${x}px`;
        this.rectElement.style.top = `${y}px`;
        this.rectElement.style.width = `${w}px`;
        this.rectElement.style.height = `${h}px`;
    }

    // 選択矩形と交差するファイルの選択状態を更新する
    checkIntersection(rectX, rectY, rectW, rectH, isCtrl) {
        const isGrid = document.getElementById('file-grid').style.display !== 'none';
        const selector = isGrid ? '.grid-item' : '#file-list-body tr';
        const items = document.querySelectorAll(selector);
        
        items.forEach(item => {
            const box = item.getBoundingClientRect();
            
            const intersects = (
                rectX < box.right &&
                rectX + rectW > box.left &&
                rectY < box.bottom &&
                rectY + rectH > box.top
            );

            if (intersects) {
                item.classList.add('selected');
            } else {
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

    // すべてのファイル選択状態をクリアする
    clearSelection() {
        document.querySelectorAll('#file-list-body tr.selected, .grid-item.selected').forEach(el => {
            el.classList.remove('selected');
        });
        if (typeof onSelectionChanged === 'function') {
            onSelectionChanged();
        }
    }
}

window.mouseManager = new MouseManager();
