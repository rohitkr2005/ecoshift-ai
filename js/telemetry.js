/**
 * EcoShift AI - Telemetry & Context Ingestion Engine
 * Handles live PZEM sensor telemetry, real-time waveform animations,
 * 60-day historical power consumption analysis, and live packet stream.
 *
 * SPECIFICATIONS:
 * 1. Main Grid (AC): Voltage 200V - 250V, Current 1A - 16A, Power = V * I (kW = V * I / 1000).
 * 2. Solar (DC): Voltage 0V - 48V DC, Current 0A - 16A DC, Power = V * I.
 * 3. Wind (DC): Voltage 0V - 48V DC, Current 0A - 16A DC, Power = V * I.
 */

// Configuration for the 3 power sources with updated electrical constraints
const SOURCE_CONFIG = {
    grid: {
        id: 'grid',
        name: 'Main Thermal Grid',
        badge: 'Single-Phase 200V-250V AC Feed',
        pzemId: 'PZEM-004T-GRID-01',
        themeClass: 'theme-grid',
        systemType: 'AC',
        color: '#38bdf8',
        glowColor: 'rgba(56, 189, 248, 0.4)',
        nominalVoltage: 230.0,
        voltageMin: 200.0,
        voltageMax: 250.0,
        voltageVariance: 5.5,
        baseCurrent: 8.5,
        currentMin: 1.0,
        currentMax: 16.0,
        currentVariance: 2.2,
        dailyBaseKwh: 38.7,
        dailyVariance: 6.5,
        weekdayMultiplier: 1.25,
        weekendMultiplier: 0.65,
        unit: 'kWh',
        description: 'Municipal grid inlet monitored by PZEM-004T. Voltage: 200-250V, Current: 1-16A, Power = V * I.'
    },
    solar: {
        id: 'solar',
        name: 'On-Site Solar PV (DC)',
        badge: 'DC Microgrid 0-48V Bus',
        pzemId: 'PZEM-DC-SOLAR-02',
        themeClass: 'theme-solar',
        systemType: 'DC',
        color: '#f59e0b',
        glowColor: 'rgba(245, 158, 11, 0.4)',
        nominalVoltage: 42.0,
        voltageMin: 0.0,
        voltageMax: 48.0,
        voltageVariance: 3.2,
        baseCurrent: 7.5,
        currentMin: 0.0,
        currentMax: 16.0,
        currentVariance: 2.5,
        dailyBaseKwh: 3.7,
        dailyVariance: 0.9,
        weatherPattern: true,
        unit: 'kWh',
        description: 'Solar DC array feed routed directly through 0-48V DC bus. Current: 0-16A DC, Power = V * I.'
    },
    wind: {
        id: 'wind',
        name: 'Wind Micro-Turbine (DC)',
        badge: 'DC Rectified 0-48V Bus',
        pzemId: 'PZEM-DC-WIND-03',
        themeClass: 'theme-wind',
        systemType: 'DC',
        color: '#10b981',
        glowColor: 'rgba(16, 185, 129, 0.4)',
        nominalVoltage: 36.5,
        voltageMin: 0.0,
        voltageMax: 48.0,
        voltageVariance: 4.5,
        baseCurrent: 6.2,
        currentMin: 0.0,
        currentMax: 16.0,
        currentVariance: 2.8,
        dailyBaseKwh: 4.2,
        dailyVariance: 1.2,
        windGustPattern: true,
        unit: 'kWh',
        description: 'Wind turbine induction generator rectified to 0-48V DC bus. Current: 0-16A DC, Power = V * I.'
    }
};

class TelemetryManager {
    constructor(sourceKey) {
        this.sourceKey = sourceKey;
        this.config = SOURCE_CONFIG[sourceKey] || SOURCE_CONFIG.grid;
        this.isLive = true;
        this.pollInterval = 2000; // 2 seconds update
        this.timer = null;
        
        // Sensor states constrained strictly to user specifications
        this.currentVoltage = this.config.nominalVoltage;
        this.currentAmpere = this.config.baseCurrent;
        // Strictly Power = V * I in Watts, converted to kW
        this.activePowerKw = Number(((this.currentVoltage * this.currentAmpere) / 1000).toFixed(3));
        this.todayKwh = Number((this.config.dailyBaseKwh * 0.42).toFixed(2)); // partial day energy
        this.cumKwh = sourceKey === 'grid' ? 2324.2 : (sourceKey === 'solar' ? 221.5 : 252.0);
        
        // Sparkline buffers (last 20 points)
        this.voltageHistory = Array.from({ length: 20 }, () => this.config.nominalVoltage + (Math.random() - 0.5) * 1.5);
        this.currentHistory = Array.from({ length: 20 }, () => this.config.baseCurrent + (Math.random() - 0.5) * 1.2);
        
        // 60-day historical data
        this.historicalData = this.generate60DayHistory();
        this.chartInstance = null;
        this.chartViewMode = 'daily'; // 'daily' or 'weekly'
    }

    init() {
        this.updateClock();
        setInterval(() => this.updateClock(), 1000);
        
        // Render initial UI readouts
        this.updateDOM();
        
        // Initialize Sparkline canvases
        this.drawSparkline('voltageCanvas', this.voltageHistory, this.config.color);
        this.drawSparkline('currentCanvas', this.currentHistory, this.config.color);
        
        // Initialize 60-Day Chart.js
        this.render60DayChart();
        
        // Start live sensor streaming loop
        this.startStream();
        
        // Populate initial packet table
        this.initPacketTable();
    }

    updateClock() {
        const dateElem = document.getElementById('liveClock');
        if (dateElem) {
            const now = new Date();
            dateElem.textContent = now.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
            }) + ' • ' + now.toLocaleTimeString('en-US', {
                hour12: false
            }) + ' UTC';
        }
    }

    startStream() {
        if (this.timer) clearInterval(this.timer);
        this.timer = setInterval(() => {
            if (this.isLive) {
                this.tickSensor();
            }
        }, this.pollInterval);
    }

    toggleLive() {
        this.isLive = !this.isLive;
        const btn = document.getElementById('streamToggleBtn');
        const badge = document.getElementById('streamBadge');
        if (btn) {
            btn.innerHTML = this.isLive 
                ? '<i class="fas fa-pause"></i> Pause Stream' 
                : '<i class="fas fa-play"></i> Resume Stream';
        }
        if (badge) {
            badge.textContent = this.isLive ? 'STREAMING 2s' : 'STREAM PAUSED';
            badge.style.color = this.isLive ? 'var(--success)' : 'var(--warning)';
        }
    }

    triggerSpike() {
        // Injects a temporary realistic load surge clamped strictly to currentMax
        const surge = 1.35;
        this.currentAmpere = Number(Math.min(this.config.currentMax, this.currentAmpere * surge).toFixed(2));
        this.currentVoltage = Number(Math.max(this.config.voltageMin, this.currentVoltage - (this.config.systemType === 'AC' ? 3.0 : 1.5)).toFixed(1));
        this.activePowerKw = Number(((this.currentVoltage * this.currentAmpere) / 1000).toFixed(3));
        this.updateDOM();
        this.logPacket(true);
    }

    tickSensor() {
        // Natural realistic sensor drift clamped strictly to user specifications
        const vNoise = (Math.random() - 0.5) * this.config.voltageVariance;
        const rawV = this.config.nominalVoltage + vNoise;
        this.currentVoltage = Number(Math.min(this.config.voltageMax, Math.max(this.config.voltageMin, rawV)).toFixed(1));
        
        const aNoise = (Math.random() - 0.5) * this.config.currentVariance;
        const rawA = this.config.baseCurrent + aNoise;
        this.currentAmpere = Number(Math.min(this.config.currentMax, Math.max(this.config.currentMin, rawA)).toFixed(2));
        
        // Instant Active Power in kW: STRICTLY (V * I) / 1000
        this.activePowerKw = Number(((this.currentVoltage * this.currentAmpere) / 1000).toFixed(3));
        
        // Accumulate energy slightly: Power (kW) * (2s / 3600s)
        const deltaKwh = this.activePowerKw * (2 / 3600);
        this.todayKwh = Number((this.todayKwh + deltaKwh).toFixed(3));
        this.cumKwh = Number((this.cumKwh + deltaKwh).toFixed(2));
        
        // Shift history buffers
        this.voltageHistory.push(this.currentVoltage);
        this.voltageHistory.shift();
        this.currentHistory.push(this.currentAmpere);
        this.currentHistory.shift();
        
        // Update DOM & Sparklines
        this.updateDOM();
        this.drawSparkline('voltageCanvas', this.voltageHistory, this.config.color);
        this.drawSparkline('currentCanvas', this.currentHistory, this.config.color);
        
        // Log telemetry packet to table
        this.logPacket(false);
    }

    updateDOM() {
        // 1. Voltage (Main Grid: 200-250V, Solar/Wind: 0-48V DC)
        const vElem = document.getElementById('liveVoltageVal');
        if (vElem) vElem.textContent = this.currentVoltage.toFixed(1);
        
        const vMin = Math.min(...this.voltageHistory).toFixed(1);
        const vMax = Math.max(...this.voltageHistory).toFixed(1);
        const vMinElem = document.getElementById('vMinVal');
        const vMaxElem = document.getElementById('vMaxVal');
        if (vMinElem) vMinElem.textContent = vMin + 'V';
        if (vMaxElem) vMaxElem.textContent = vMax + 'V';

        // 2. Current (1A - 16A or 0A - 16A)
        const aElem = document.getElementById('liveCurrentVal');
        if (aElem) aElem.textContent = this.currentAmpere.toFixed(2);
        
        const aPeak = Math.max(...this.currentHistory).toFixed(2);
        const aAvg = (this.currentHistory.reduce((a, b) => a + b, 0) / this.currentHistory.length).toFixed(2);
        const aPeakElem = document.getElementById('aPeakVal');
        const aAvgElem = document.getElementById('aAvgVal');
        if (aPeakElem) aPeakElem.textContent = aPeak + 'A';
        if (aAvgElem) aAvgElem.textContent = aAvg + 'A';

        // 3. Power Consumption (P = V * I)
        const pElem = document.getElementById('activePowerVal');
        if (pElem) pElem.textContent = this.activePowerKw.toFixed(3);
        
        const todayElem = document.getElementById('todayKwhVal');
        if (todayElem) todayElem.textContent = this.todayKwh.toFixed(2) + ' kWh';
        
        const cumElem = document.getElementById('cumKwhVal');
        if (cumElem) cumElem.textContent = this.cumKwh.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' kWh';
        
        const pfElem = document.getElementById('pfVal');
        if (pfElem) {
            // For DC, PF is not applicable or 1.0; for Grid, show V*I calculation formula
            pfElem.textContent = this.config.systemType === 'DC' ? 'DC Bus' : 'V × I';
        }
    }

    drawSparkline(canvasId, data, strokeColor) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const width = canvas.width = canvas.parentElement.clientWidth || 300;
        const height = canvas.height = canvas.parentElement.clientHeight || 70;
        
        ctx.clearRect(0, 0, width, height);
        if (data.length < 2) return;
        
        const min = Math.min(...data) * 0.96;
        const max = Math.max(...data) * 1.04;
        const range = max - min || 1;
        const stepX = width / (data.length - 1);
        
        const grad = ctx.createLinearGradient(0, 0, 0, height);
        grad.addColorStop(0, strokeColor + '44');
        grad.addColorStop(1, strokeColor + '00');
        
        ctx.beginPath();
        data.forEach((val, i) => {
            const x = i * stepX;
            const y = height - ((val - min) / range) * (height - 12) - 6;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        
        ctx.lineTo(width, height);
        ctx.lineTo(0, height);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();
        
        ctx.beginPath();
        data.forEach((val, i) => {
            const x = i * stepX;
            const y = height - ((val - min) / range) * (height - 12) - 6;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 2.5;
        ctx.stroke();
        
        const lastX = (data.length - 1) * stepX;
        const lastY = height - ((data[data.length - 1] - min) / range) * (height - 12) - 6;
        ctx.beginPath();
        ctx.arc(lastX - 2, lastY, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.shadowColor = strokeColor;
        ctx.shadowBlur = 8;
        ctx.stroke();
        ctx.shadowBlur = 0;
    }

    /**
     * Generates realistic 60-day historical power dataset scaled to 1A-16A & 200-250V (Grid)
     * and 0-48V DC, 0-16A (Solar/Wind).
     */
    generate60DayHistory() {
        const days = 60;
        const records = [];
        const today = new Date();
        
        let month1Total = 0; // days 1-30 (older month)
        let month2Total = 0; // days 31-60 (recent month)
        let maxKwh = 0;
        let peakDayStr = '';

        for (let i = days - 1; i >= 0; i--) {
            const d = new Date();
            d.setDate(today.getDate() - i);
            
            const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const dayOfWeek = d.getDay();
            const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
            
            let consumption = this.config.dailyBaseKwh;
            
            if (this.sourceKey === 'grid') {
                // Scaled to 200V-250V, 1A-16A: ~18 to 48 kWh per day
                const multiplier = isWeekend ? this.config.weekendMultiplier : this.config.weekdayMultiplier;
                const noise = (Math.sin(i * 0.4) + Math.cos(i * 0.8)) * (this.config.dailyVariance * 0.4);
                consumption = Number((consumption * multiplier + noise).toFixed(2));
                consumption = Math.max(12.0, Math.min(52.0, consumption));
            } else if (this.sourceKey === 'solar') {
                // Scaled to 0-48V DC, 0-16A: ~1.5 to 4.5 kWh per day
                const sunFactor = 0.85 + 0.3 * Math.sin(i * 0.3) + 0.1 * Math.cos(i * 0.7);
                const cloudDip = (i % 7 === 2 || i % 11 === 0) ? 0.45 : 1.0;
                consumption = Number((this.config.dailyBaseKwh * sunFactor * cloudDip).toFixed(2));
                consumption = Math.max(0.8, Math.min(4.8, consumption));
            } else if (this.sourceKey === 'wind') {
                // Scaled to 0-48V DC, 0-16A: ~1.8 to 5.2 kWh per day
                const windFront = Math.abs(Math.sin(i * 0.5)) * 1.35 + 0.35;
                const gustFactor = 0.85 + (Math.sin(i * 1.2) * 0.2);
                consumption = Number((this.config.dailyBaseKwh * windFront * gustFactor).toFixed(2));
                consumption = Math.max(0.6, Math.min(5.5, consumption));
            }
            
            if (i >= 30) {
                month1Total += consumption;
            } else {
                month2Total += consumption;
            }
            
            if (consumption > maxKwh) {
                maxKwh = consumption;
                peakDayStr = `${dateStr} (${consumption} kWh)`;
            }
            
            records.push({
                date: dateStr,
                fullDate: d.toISOString().split('T')[0],
                kwh: consumption,
                peakKw: Number((consumption / 14).toFixed(2)),
                isWeekend: isWeekend
            });
        }

        const totalKwh = Number((month1Total + month2Total).toFixed(1));
        const avgDaily = Number((totalKwh / days).toFixed(2));
        const pctChange = (((month2Total - month1Total) / (month1Total || 1)) * 100).toFixed(1);

        return {
            records,
            stats: {
                totalKwh,
                month1Total: Number(month1Total.toFixed(1)),
                month2Total: Number(month2Total.toFixed(1)),
                avgDaily,
                pctChange,
                peakDayStr
            }
        };
    }

    render60DayChart() {
        const ctx = document.getElementById('historyChartCanvas');
        if (!ctx) return;

        const stats = this.historicalData.stats;
        document.getElementById('statTotal60d').textContent = stats.totalKwh.toLocaleString() + ' kWh';
        document.getElementById('statAvgDaily').textContent = stats.avgDaily.toLocaleString() + ' kWh/d';
        document.getElementById('statPeakDay').textContent = stats.peakDayStr;
        
        const mChangeElem = document.getElementById('statMonthChange');
        if (mChangeElem) {
            const isPos = Number(stats.pctChange) >= 0;
            mChangeElem.textContent = `${isPos ? '+' : ''}${stats.pctChange}% vs Prev Mo`;
            mChangeElem.className = `stat-sub ${isPos ? 'positive' : 'accent'}`;
        }
        
        document.getElementById('statM1').textContent = stats.month1Total.toLocaleString() + ' kWh';
        document.getElementById('statM2').textContent = stats.month2Total.toLocaleString() + ' kWh';

        const labels = this.historicalData.records.map(r => r.date);
        const dataValues = this.historicalData.records.map(r => r.kwh);

        if (this.chartInstance) {
            this.chartInstance.destroy();
        }

        const chartColor = this.config.color;

        this.chartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        type: 'line',
                        label: '7-Day Rolling Baseline',
                        data: this.calculateMovingAverage(dataValues, 7),
                        borderColor: '#ffffff',
                        borderWidth: 2,
                        pointRadius: 0,
                        tension: 0.35,
                        borderDash: [4, 4],
                        fill: false,
                        yAxisID: 'y'
                    },
                    {
                        type: 'bar',
                        label: `Daily Power Consumption (${this.config.systemType}: P = V × I)`,
                        data: dataValues,
                        backgroundColor: (context) => {
                            const chart = context.chart;
                            const { ctx, chartArea } = chart;
                            if (!chartArea) return chartColor;
                            const gradient = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
                            gradient.addColorStop(0, chartColor + '33');
                            gradient.addColorStop(1, chartColor + 'dd');
                            return gradient;
                        },
                        borderColor: chartColor,
                        borderWidth: 1,
                        borderRadius: 4,
                        hoverBackgroundColor: '#ffffff',
                        yAxisID: 'y'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            color: '#94a3b8',
                            font: { family: 'Inter', size: 12, weight: 600 },
                            usePointStyle: true,
                            boxWidth: 8
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.95)',
                        titleColor: '#ffffff',
                        bodyColor: '#cbd5e1',
                        borderColor: 'rgba(255, 255, 255, 0.15)',
                        borderWidth: 1,
                        padding: 12,
                        boxPadding: 6,
                        titleFont: { family: 'Inter', weight: 700, size: 13 },
                        bodyFont: { family: 'JetBrains Mono', size: 12 },
                        callbacks: {
                            label: function(context) {
                                return ` ${context.dataset.label}: ${context.raw.toLocaleString()} kWh`;
                            },
                            afterBody: (tooltipItems) => {
                                const index = tooltipItems[0].dataIndex;
                                const rec = this.historicalData.records[index];
                                return [
                                    `Estimated Peak Draw: ${rec.peakKw} kW`,
                                    `Formula: P = V × I (${this.config.systemType})`,
                                    `Telemetry Status: Ingested from 5,760-point dataset`
                                ];
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: {
                            color: 'rgba(255, 255, 255, 0.04)',
                            drawBorder: false
                        },
                        ticks: {
                            color: '#64748b',
                            font: { family: 'Inter', size: 10 },
                            maxTicksLimit: 15
                        }
                    },
                    y: {
                        grid: {
                            color: 'rgba(255, 255, 255, 0.05)',
                            drawBorder: false
                        },
                        ticks: {
                            color: '#94a3b8',
                            font: { family: 'JetBrains Mono', size: 11 },
                            callback: function(val) {
                                return val + ' kWh';
                            }
                        }
                    }
                }
            }
        });
    }

    calculateMovingAverage(data, windowSize) {
        const ma = [];
        for (let i = 0; i < data.length; i++) {
            const start = Math.max(0, i - windowSize + 1);
            const subset = data.slice(start, i + 1);
            const sum = subset.reduce((acc, val) => acc + val, 0);
            ma.push(Number((sum / subset.length).toFixed(2)));
        }
        return ma;
    }

    setChartView(mode) {
        this.chartViewMode = mode;
        const btnDaily = document.getElementById('btnViewDaily');
        const btnWeekly = document.getElementById('btnViewWeekly');
        if (mode === 'daily') {
            btnDaily?.classList.add('active');
            btnWeekly?.classList.remove('active');
            this.render60DayChart();
        } else {
            btnWeekly?.classList.add('active');
            btnDaily?.classList.remove('active');
            this.renderWeeklyChart();
        }
    }

    renderWeeklyChart() {
        const ctx = document.getElementById('historyChartCanvas');
        if (!ctx) return;

        const weeks = [];
        const records = this.historicalData.records;
        const chunkSize = 7;
        for (let i = 0; i < records.length; i += chunkSize) {
            const slice = records.slice(i, i + chunkSize);
            const weekTotal = Number(slice.reduce((a, b) => a + b.kwh, 0).toFixed(1));
            const label = `Wk ${Math.floor(i / chunkSize) + 1} (${slice[0].date})`;
            weeks.push({ label, total: weekTotal });
        }

        if (this.chartInstance) this.chartInstance.destroy();
        const chartColor = this.config.color;

        this.chartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: weeks.map(w => w.label),
                datasets: [{
                    label: 'Weekly Cumulative Power (kWh)',
                    data: weeks.map(w => w.total),
                    backgroundColor: chartColor + 'cc',
                    borderColor: chartColor,
                    borderWidth: 1.5,
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        labels: { color: '#94a3b8', font: { family: 'Inter', size: 12 } }
                    }
                },
                scales: {
                    x: { ticks: { color: '#94a3b8' }, grid: { display: false } },
                    y: {
                        ticks: { color: '#94a3b8', callback: v => v + ' kWh' },
                        grid: { color: 'rgba(255, 255, 255, 0.05)' }
                    }
                }
            }
        });
    }

    initPacketTable() {
        const tbody = document.getElementById('packetTableBody');
        if (!tbody) return;
        tbody.innerHTML = '';
        for (let i = 0; i < 5; i++) {
            this.logPacket(false, i * 2);
        }
    }

    logPacket(isSpike = false, delaySecondsAgo = 0) {
        const tbody = document.getElementById('packetTableBody');
        if (!tbody) return;
        
        const now = new Date(Date.now() - delaySecondsAgo * 1000);
        const timeStr = now.toLocaleTimeString('en-US', { hour12: false }) + '.' + String(now.getMilliseconds()).padStart(3, '0').slice(0, 2);
        
        const tr = document.createElement('tr');
        if (isSpike) tr.style.background = 'rgba(239, 68, 68, 0.15)';
        
        tr.innerHTML = `
            <td>${timeStr}</td>
            <td><span class="pzem-id">${this.config.pzemId}</span></td>
            <td style="color: #ffffff;">${this.currentVoltage.toFixed(1)} V</td>
            <td style="color: #ffffff;">${this.currentAmpere.toFixed(2)} A</td>
            <td style="color: ${this.config.color}; font-weight: 700;">${this.activePowerKw.toFixed(3)} kW</td>
            <td><span class="status-tag ok">${isSpike ? 'SURGE_INGEST' : 'INGEST_200'}</span></td>
        `;
        
        tbody.insertBefore(tr, tbody.firstChild);
        
        while (tbody.children.length > 7) {
            tbody.removeChild(tbody.lastChild);
        }
    }
}

// Global accessor
window.TelemetryManager = TelemetryManager;
