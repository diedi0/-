/**
 * 项目报价单 - 配色方案模块
 * 保留原始 21 种配色方案
 */
var colorScheme = (function () {
    var schemes = {
        'default': {
            title: 'linear-gradient(135deg,#4f46e5,#7c3aed)',
            categoryBg: 'linear-gradient(90deg,#ede9fe,#f5f3ff)',
            categoryBorder: '#8b5cf6',
            categoryText: '#5b21b6',
            totalBg: '#fefce8',
            totalText: '#854d0e'
        },
        'solid-blue': {
            title: '#2563eb', categoryBg: '#dbeafe', categoryBorder: '#3b82f6',
            categoryText: '#1e40af', totalBg: '#eff6ff', totalText: '#1e3a8a'
        },
        'solid-green': {
            title: '#16a34a', categoryBg: '#dcfce7', categoryBorder: '#22c55e',
            categoryText: '#166534', totalBg: '#f0fdf4', totalText: '#14532d'
        },
        'solid-red': {
            title: '#dc2626', categoryBg: '#fee2e2', categoryBorder: '#ef4444',
            categoryText: '#991b1b', totalBg: '#fef2f2', totalText: '#7f1d1d'
        },
        'solid-orange': {
            title: '#ea580c', categoryBg: '#ffedd5', categoryBorder: '#f97316',
            categoryText: '#9a3412', totalBg: '#fff7ed', totalText: '#7c2d12'
        },
        'solid-purple': {
            title: '#9333ea', categoryBg: '#f3e8ff', categoryBorder: '#a855f7',
            categoryText: '#6b21a8', totalBg: '#faf5ff', totalText: '#581c87'
        },
        'solid-teal': {
            title: '#0d9488', categoryBg: '#ccfbf1', categoryBorder: '#14b8a6',
            categoryText: '#115e59', totalBg: '#f0fdfa', totalText: '#134e4a'
        },
        'solid-pink': {
            title: '#db2777', categoryBg: '#fce7f3', categoryBorder: '#ec4899',
            categoryText: '#9d174d', totalBg: '#fdf2f8', totalText: '#831843'
        },
        'solid-indigo': {
            title: '#4f46e5', categoryBg: '#e0e7ff', categoryBorder: '#6366f1',
            categoryText: '#3730a3', totalBg: '#eef2ff', totalText: '#312e81'
        },
        'solid-cyan': {
            title: '#0891b2', categoryBg: '#cffafe', categoryBorder: '#06b6d4',
            categoryText: '#155e75', totalBg: '#ecfeff', totalText: '#164e63'
        },
        'solid-emerald': {
            title: '#059669', categoryBg: '#d1fae5', categoryBorder: '#10b981',
            categoryText: '#065f46', totalBg: '#ecfdf5', totalText: '#064e3b'
        },
        'gradient-blue': {
            title: 'linear-gradient(135deg,#06b6d4,#3b82f6)',
            categoryBg: 'linear-gradient(90deg,#cffafe,#dbeafe)',
            categoryBorder: '#0ea5e9', categoryText: '#0c4a6e',
            totalBg: '#f0f9ff', totalText: '#0c4a6e'
        },
        'gradient-green': {
            title: 'linear-gradient(135deg,#10b981,#06b6d4)',
            categoryBg: 'linear-gradient(90deg,#d1fae5,#ccfbf1)',
            categoryBorder: '#14b8a6', categoryText: '#134e4a',
            totalBg: '#f0fdfa', totalText: '#134e4a'
        },
        'gradient-red': {
            title: 'linear-gradient(135deg,#ef4444,#f97316)',
            categoryBg: 'linear-gradient(90deg,#fee2e2,#ffedd5)',
            categoryBorder: '#f97316', categoryText: '#7c2d12',
            totalBg: '#fff7ed', totalText: '#7c2d12'
        },
        'gradient-purple': {
            title: 'linear-gradient(135deg,#a855f7,#ec4899)',
            categoryBg: 'linear-gradient(90deg,#f3e8ff,#fce7f3)',
            categoryBorder: '#d946ef', categoryText: '#86198f',
            totalBg: '#fdf4ff', totalText: '#86198f'
        },
        'gradient-orange': {
            title: 'linear-gradient(135deg,#f97316,#eab308)',
            categoryBg: 'linear-gradient(90deg,#ffedd5,#fef9c3)',
            categoryBorder: '#ca8a04', categoryText: '#713f12',
            totalBg: '#fefce8', totalText: '#713f12'
        },
        'gradient-teal': {
            title: 'linear-gradient(135deg,#14b8a6,#6366f1)',
            categoryBg: 'linear-gradient(90deg,#ccfbf1,#e0e7ff)',
            categoryBorder: '#6366f1', categoryText: '#3730a3',
            totalBg: '#eef2ff', totalText: '#3730a3'
        },
        'gradient-indigo': {
            title: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
            categoryBg: 'linear-gradient(90deg,#e0e7ff,#ede9fe)',
            categoryBorder: '#8b5cf6', categoryText: '#5b21b6',
            totalBg: '#f5f3ff', totalText: '#5b21b6'
        },
        'gradient-pink': {
            title: 'linear-gradient(135deg,#ec4899,#8b5cf6)',
            categoryBg: 'linear-gradient(90deg,#fce7f3,#ede9fe)',
            categoryBorder: '#a855f7', categoryText: '#6b21a8',
            totalBg: '#faf5ff', totalText: '#6b21a8'
        },
        'gradient-cyan': {
            title: 'linear-gradient(135deg,#06b6d4,#10b981)',
            categoryBg: 'linear-gradient(90deg,#cffafe,#d1fae5)',
            categoryBorder: '#10b981', categoryText: '#065f46',
            totalBg: '#ecfdf5', totalText: '#065f46'
        },
        'gradient-warm': {
            title: 'linear-gradient(135deg,#f97316,#ef4444)',
            categoryBg: 'linear-gradient(90deg,#ffedd5,#fee2e2)',
            categoryBorder: '#ef4444', categoryText: '#991b1b',
            totalBg: '#fef2f2', totalText: '#991b1b'
        }
    };

    var chineseNums = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

    function getChineseNum(n) {
        return chineseNums[n] || (n + 1);
    }

    /** 应用当前选中的配色 */
    function apply() {
        var name = document.getElementById('pqColorScheme').value;
        var scheme = schemes[name];
        if (!scheme) return;

        var titleEl = document.getElementById('pqTitle');
        if (titleEl) {
            if (scheme.title.indexOf('linear-gradient') === 0) {
                titleEl.style.background = scheme.title;
                titleEl.style.webkitBackgroundClip = 'text';
                titleEl.style.webkitTextFillColor = 'transparent';
                titleEl.style.backgroundClip = 'text';
                titleEl.style.color = '';
            } else {
                titleEl.style.background = 'none';
                titleEl.style.webkitTextFillColor = scheme.title;
                titleEl.style.color = scheme.title;
            }
        }

        var cats = document.querySelectorAll('.pq-category');
        cats.forEach(function (cat) {
            var header = cat.querySelector('.category-header');
            if (header) {
                header.style.background = scheme.categoryBg;
                header.style.borderLeftColor = scheme.categoryBorder;
                var numEl = header.querySelector('.category-num');
                if (numEl) numEl.style.color = scheme.categoryText;
            }
            var totalRow = cat.querySelector('.category-total-row');
            if (totalRow) {
                totalRow.style.background = scheme.totalBg;
                var labelEl = totalRow.querySelector('.category-total-label');
                if (labelEl) labelEl.style.color = scheme.totalText;
            }
        });
    }

    /** 获取指定配色方案 */
    function get(name) {
        return schemes[name] || schemes['default'];
    }

    return {
        apply: apply,
        get: get,
        getChineseNum: getChineseNum,
        schemes: schemes
    };
})();
