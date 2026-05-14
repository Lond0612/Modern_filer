/**
 * ShortcutManager
 * アプリケーション全体のショートカットキーを一括管理するクラス
 */
const ShortcutManager = {
    shortcuts: [],
    isEnabled: true,

    /**
     * 初期化
     */
    init() {
        window.addEventListener('keydown', (e) => this.handleKeyDown(e), true);
        console.log('ShortcutManager initialized');
    },

    /**
     * ショートカットの登録
     * @param {string} keyCombo - 'Ctrl+T', 'Space', 'ArrowUp', 'Ctrl+Shift+T' など
     * @param {function} callback - 発火時の関数
     * @param {object} options - { preventDefault: boolean, allowInInputs: boolean }
     */
    register(keyCombo, callback, options = {}) {
        this.shortcuts.push({
            combo: keyCombo,
            callback: callback,
            options: {
                preventDefault: options.preventDefault !== false,
                allowInInputs: options.allowInInputs === true
            }
        });
    },

    /**
     * キーダウンイベントのハンドリング
     */
    handleKeyDown(e) {
        if (!this.isEnabled) return;

        // 入力エリアにフォーカスがある場合のデフォルト制御
        const active = document.activeElement;
        const isInput = active && (
            active.tagName === 'INPUT' || 
            active.tagName === 'TEXTAREA' || 
            active.isContentEditable
        );

        for (const s of this.shortcuts) {
            if (this.isMatch(e, s.combo)) {
                // 入力エリア内での実行が許可されていない場合はスキップ
                if (isInput && !s.options.allowInInputs) {
                    continue;
                }

                if (s.options.preventDefault) {
                    e.preventDefault();
                }
                
                s.callback(e);
                return; // 最初に見つかった一致するショートカットのみ実行
            }
        }
    },

    /**
     * イベントが指定されたコンボと一致するか判定
     */
    isMatch(e, combo) {
        const parts = combo.split('+');
        const mainKey = parts.pop().toLowerCase();
        
        const hasCtrl = parts.some(p => p.toLowerCase() === 'ctrl');
        const hasShift = parts.some(p => p.toLowerCase() === 'shift');
        const hasAlt = parts.some(p => p.toLowerCase() === 'alt');

        // 特殊キーの判定
        // e.key は文字、e.code は物理キー（Space など）
        const keyMatch = e.key.toLowerCase() === mainKey || 
                         e.code.toLowerCase() === mainKey;

        return keyMatch &&
               e.ctrlKey === hasCtrl &&
               e.shiftKey === hasShift &&
               e.altKey === hasAlt;
    },

    /**
     * 全体の一時無効化/有効化
     */
    disable() { this.isEnabled = false; },
    enable() { this.isEnabled = true; }
};

// 起動時に初期化
document.addEventListener('DOMContentLoaded', () => {
    ShortcutManager.init();
});
