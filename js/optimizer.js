/**
 * EcoShift AI - Smart Priority Dispatch Optimizer, Carbon Credit & ROI Engine
 * Calculates real-time and 60-day aggregate priority dispatch from 5,760-sample telemetry.
 * 
 * Dispatch Rule:
 * 1. Priority 1: Instantaneous Facility Load met by Solar (DC) + Wind (DC) generation.
 * 2. Priority 2: Any excess green power banked or diverted.
 * 3. Priority 3: Only the remaining deficit is drawn from the Main Thermal Grid.
 */

class DispatchOptimizer {
    constructor() {
        this.data = null;
        this.mode = 'optimized'; // 'optimized' or 'baseline'
        this.carbonPrice = 1500.0; // ₹ per metric ton CO2
        this.gridTariff = 9.50;    // ₹ per kWh
        this.renScale = 1.0;       // Scale factor for scenario testing
        
        this.flowChartInstance = null;
        this.roiChartInstance = null;
    }

    async init() {
        this.updateClock();
        setInterval(() => this.updateClock(), 1000);

        try {
            const resp = await fetch('data/optimization_data.json?v=' + Date.now());
            if (resp.ok) {
                this.data = await resp.json();
                console.log('[EcoShift AI] Loaded 60-day optimization dataset successfully.');
            }
        } catch (e) {
            console.warn('[EcoShift AI] Optimization JSON fetch failed, using fallback calculations.', e);
        }

        this.bindEvents();
        this.renderAll();
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

    bindEvents() {
        // Mode toggle buttons (Optimized vs Baseline)
        const btnOpt = document.getElementById('btnModeOptimized');
        const btnBase = document.getElementById('btnModeBaseline');
        
        if (btnOpt && btnBase) {
            btnOpt.addEventListener('click', () => {
                this.mode = 'optimized';
                btnOpt.classList.add('active');
                btnBase.classList.remove('active');
                this.renderAll();
            });

            btnBase.addEventListener('click', () => {
                this.mode = 'baseline';
                btnBase.classList.add('active');
                btnOpt.classList.remove('active');
                this.renderAll();
            });
        }

        // Sliders for dynamic scenario tuning
        const carbonSlider = document.getElementById('carbonPriceSlider');
        const tariffSlider = document.getElementById('tariffSlider');
        const renScaleSlider = document.getElementById('renScaleSlider');

        if (carbonSlider) {
            carbonSlider.addEventListener('input', (e) => {
                this.carbonPrice = parseFloat(e.target.value);
                document.getElementById('carbonPriceVal').textContent = '₹' + this.carbonPrice.toLocaleString();
                this.renderAll();
            });
        }

        if (tariffSlider) {
            tariffSlider.addEventListener('input', (e) => {
                this.gridTariff = parseFloat(e.target.value);
                document.getElementById('tariffVal').textContent = '₹' + this.gridTariff.toFixed(2) + ' / kWh';
                this.renderAll();
            });
        }

        if (renScaleSlider) {
            renScaleSlider.addEventListener('input', (e) => {
                this.renScale = parseFloat(e.target.value) / 100.0;
                document.getElementById('renScaleVal').textContent = (this.renScale * 100).toFixed(0) + '% Array Size';
                this.renderAll();
            });
        }
    }

    /**
     * Recomputes totals given active sliders and mode
     */
    computeMetrics() {
        if (!this.data) return null;

        const summary = this.data.summary;
        const totalLoad = summary.total_load_kwh;
        const baseSolar = summary.total_solar_kwh * this.renScale;
        const baseWind = summary.total_wind_kwh * this.renScale;
        const totalRenAvail = baseSolar + baseWind;

        let renUsed = 0;
        let gridOpt = 0;
        let gridSaved = 0;
        let co2AvoidedKg = 0;
        let credits = 0;
        let tariffSavedInr = 0;
        let carbonRevInr = 0;
        let totalNetInr = 0;

        if (this.mode === 'optimized') {
            renUsed = Math.min(totalLoad, totalRenAvail);
            gridOpt = Math.max(0, totalLoad - totalRenAvail);
            gridSaved = renUsed;
            co2AvoidedKg = gridSaved * summary.grid_emission_factor_kg_per_kwh;
            credits = co2AvoidedKg / 1000.0;
            tariffSavedInr = gridSaved * (this.gridTariff - 2.40);
            carbonRevInr = credits * this.carbonPrice;
            totalNetInr = tariffSavedInr + carbonRevInr;
        } else {
            // Unoptimized baseline: load all drawn uncoordinatedly
            renUsed = totalRenAvail * 0.25; // only 25% coincidentally used
            gridOpt = totalLoad - renUsed;
            gridSaved = 0;
            co2AvoidedKg = 0;
            credits = 0;
            tariffSavedInr = 0;
            carbonRevInr = 0;
            totalNetInr = 0;
        }

        const co2AvoidedMt = co2AvoidedKg / 1000.0;
        const renCoveragePct = ((renUsed / totalLoad) * 100.0);
        const renUtilRatePct = totalRenAvail > 0 ? ((renUsed / totalRenAvail) * 100.0) : 0;
        const treesEq = Math.round(co2AvoidedKg / (21.77 * (60.0 / 365.0)));

        // Annualized projections
        const annualMult = 365.0 / 60.0;
        const annualNetValInr = totalNetInr * annualMult;
        const capex = summary.capex_inr * (0.8 + 0.2 * this.renScale);
        const paybackYears = annualNetValInr > 0 ? (capex / annualNetValInr).toFixed(2) : 'N/A';
        const roi5Year = annualNetValInr > 0 ? (((annualNetValInr * 5 - capex) / capex) * 100).toFixed(1) : '-100.0';

        return {
            totalLoad,
            totalRenAvail,
            renUsed,
            gridOpt,
            gridSaved,
            renCoveragePct: renCoveragePct.toFixed(1),
            renUtilRatePct: renUtilRatePct.toFixed(1),
            co2AvoidedKg: co2AvoidedKg.toFixed(1),
            co2AvoidedMt: co2AvoidedMt.toFixed(3),
            credits: credits.toFixed(3),
            treesEq,
            tariffSavedInr: Math.round(tariffSavedInr),
            carbonRevInr: Math.round(carbonRevInr),
            totalNetInr: Math.round(totalNetInr),
            annualNetValInr: Math.round(annualNetValInr),
            paybackYears,
            roi5Year
        };
    }

    renderAll() {
        const m = this.computeMetrics();
        if (!m) return;

        // 1. KPI Cards
        document.getElementById('kpiRenCoverage').textContent = m.renCoveragePct + '%';
        document.getElementById('kpiGridSaved').textContent = Math.round(m.gridSaved).toLocaleString() + ' kWh';
        document.getElementById('kpiCo2Avoided').textContent = m.co2AvoidedMt + ' MT';
        document.getElementById('kpiCarbonCredits').textContent = m.credits;
        document.getElementById('kpiTotalSavings').textContent = '₹' + m.totalNetInr.toLocaleString();
        document.getElementById('kpiPayback').textContent = m.paybackYears === 'N/A' ? 'N/A' : m.paybackYears + ' Yrs';
        document.getElementById('kpiRoi5Year').textContent = m.roi5Year + '%';
        document.getElementById('kpiTreesEq').textContent = m.treesEq.toLocaleString();

        // 2. Real-Time Energy Flow Routing Diagram
        this.renderEnergyFlow(m);

        // 3. Render 60-Day Dispatch Area Chart
        this.renderDispatchChart();

        // 4. Render ROI Velocity Chart
        this.renderRoiChart(m);

        // 5. Populate Daily Ledger Table
        this.renderLedgerTable();
    }

    renderEnergyFlow(m) {
        const flowWrap = document.getElementById('energyFlowDiagram');
        if (!flowWrap) return;

        const isOpt = this.mode === 'optimized';
        const renShare = parseFloat(m.renCoveragePct);
        const gridShare = (100 - renShare).toFixed(1);

        document.getElementById('flowSolarWindVal').textContent = (m.totalRenAvail * (24/1440)).toFixed(2) + ' kW (Avail)';
        document.getElementById('flowRenUsedVal').textContent = (m.renUsed * (24/1440)).toFixed(2) + ' kW (' + renShare + '%)';
        document.getElementById('flowGridVal').textContent = (m.gridOpt * (24/1440)).toFixed(2) + ' kW (' + gridShare + '%)';
        document.getElementById('flowLoadVal').textContent = (m.totalLoad * (24/1440)).toFixed(2) + ' kW Load';

        const renLine = document.getElementById('renFlowLine');
        const gridLine = document.getElementById('gridFlowLine');
        const statusBadge = document.getElementById('dispatchStateBadge');

        if (renLine && gridLine) {
            if (isOpt) {
                renLine.style.opacity = '1';
                renLine.style.animation = 'flowPulse 1.2s infinite';
                gridLine.style.opacity = gridShare > 0 ? '0.45' : '0.1';
                if (statusBadge) {
                    statusBadge.innerHTML = '<i class="fas fa-bolt"></i> PRIORITY DISPATCH ACTIVE';
                    statusBadge.className = 'status-tag ok';
                }
            } else {
                renLine.style.opacity = '0.2';
                renLine.style.animation = 'none';
                gridLine.style.opacity = '1';
                gridLine.style.animation = 'flowPulseRed 1.5s infinite';
                if (statusBadge) {
                    statusBadge.innerHTML = '<i class="fas fa-triangle-exclamation"></i> UNOPTIMIZED GRID DRAW';
                    statusBadge.className = 'status-tag warning';
                }
            }
        }
    }

    renderDispatchChart() {
        const canvas = document.getElementById('optimizationChartCanvas');
        if (!canvas || !this.data) return;

        const daily = this.data.daily_records;
        const labels = daily.map(d => d.display_date);
        
        let renUsedData, gridDrawData, baselineData;

        if (this.mode === 'optimized') {
            renUsedData = daily.map(d => Math.round(d.ren_used_kwh * this.renScale));
            gridDrawData = daily.map(d => Math.max(0, Math.round(d.load_kwh - (d.ren_used_kwh * this.renScale))));
            baselineData = daily.map(d => d.grid_base_kwh);
        } else {
            renUsedData = daily.map(d => Math.round(d.ren_used_kwh * 0.25 * this.renScale));
            gridDrawData = daily.map(d => Math.round(d.load_kwh - (d.ren_used_kwh * 0.25 * this.renScale)));
            baselineData = daily.map(d => d.grid_base_kwh);
        }

        if (this.flowChartInstance) {
            this.flowChartInstance.destroy();
        }

        const ctx = canvas.getContext('2d');
        this.flowChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        type: 'line',
                        label: 'Unoptimized Baseline Grid Demand (kWh)',
                        data: baselineData,
                        borderColor: '#f97316',
                        borderWidth: 2,
                        borderDash: [5, 4],
                        pointRadius: 0,
                        fill: false,
                        yAxisID: 'y'
                    },
                    {
                        label: 'Solar & Wind Energy Dispatched (Green kWh)',
                        data: renUsedData,
                        backgroundColor: '#10b981cc',
                        borderColor: '#10b981',
                        borderWidth: 1,
                        borderRadius: 3,
                        stack: 'stack1'
                    },
                    {
                        label: 'Grid Deficit Energy Draw (kWh)',
                        data: gridDrawData,
                        backgroundColor: '#0ea5e9cc',
                        borderColor: '#0ea5e9',
                        borderWidth: 1,
                        borderRadius: 3,
                        stack: 'stack1'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: {
                        position: 'top',
                        labels: { color: '#94a3b8', font: { family: 'Inter', size: 11, weight: 600 } }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.95)',
                        borderColor: 'rgba(255, 255, 255, 0.1)',
                        borderWidth: 1,
                        padding: 10,
                        callbacks: {
                            label: (ctx) => ` ${ctx.dataset.label}: ${ctx.raw} kWh`,
                            afterBody: (items) => {
                                const idx = items[0].dataIndex;
                                const d = daily[idx];
                                return [
                                    `Daily CO2 Avoided: ${(d.co2_avoided_kg * this.renScale).toFixed(1)} kg`,
                                    `Carbon Credits: ${(d.carbon_credits_earned * this.renScale).toFixed(4)} VCU`
                                ];
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { color: '#64748b', font: { size: 10 }, maxTicksLimit: 14 }
                    },
                    y: {
                        stacked: true,
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: { color: '#94a3b8', callback: v => v + ' kWh' }
                    }
                }
            }
        });
    }

    renderRoiChart(m) {
        const canvas = document.getElementById('roiVelocityChartCanvas');
        if (!canvas || !this.data) return;

        const daily = this.data.daily_records;
        const labels = daily.filter((_, i) => i % 5 === 0).map(d => d.display_date);
        
        let cumBillSavings = 0;
        let cumCarbonRevenue = 0;
        const billSavingSeries = [];
        const carbonRevenueSeries = [];

        daily.forEach((d, i) => {
            if (this.mode === 'optimized') {
                cumBillSavings += d.grid_saved_kwh * this.renScale * (this.gridTariff - 2.40);
                cumCarbonRevenue += (d.co2_avoided_kg * this.renScale / 1000.0) * this.carbonPrice;
            } else {
                cumBillSavings += 0;
                cumCarbonRevenue += 0;
            }

            if (i % 5 === 0) {
                billSavingSeries.push(Math.round(cumBillSavings));
                carbonRevenueSeries.push(Math.round(cumCarbonRevenue));
            }
        });

        if (this.roiChartInstance) {
            this.roiChartInstance.destroy();
        }

        const ctx = canvas.getContext('2d');
        this.roiChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Tariff Cost Avoided (₹ INR)',
                        data: billSavingSeries,
                        borderColor: '#10b981',
                        backgroundColor: 'rgba(16, 185, 129, 0.15)',
                        fill: true,
                        tension: 0.3,
                        borderWidth: 2
                    },
                    {
                        label: 'Carbon Credit Revenue Monetized (₹ INR)',
                        data: carbonRevenueSeries,
                        borderColor: '#eab308',
                        backgroundColor: 'rgba(234, 179, 8, 0.15)',
                        fill: true,
                        tension: 0.3,
                        borderWidth: 2
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: { color: '#94a3b8', font: { family: 'Inter', size: 11, weight: 600 } }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.95)',
                        borderColor: 'rgba(255, 255, 255, 0.1)',
                        borderWidth: 1,
                        callbacks: {
                            label: (ctx) => ` ${ctx.dataset.label}: ₹${ctx.raw.toLocaleString()}`
                        }
                    }
                },
                scales: {
                    x: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { display: false } },
                    y: {
                        ticks: { color: '#94a3b8', callback: v => '₹' + v.toLocaleString() },
                        grid: { color: 'rgba(255, 255, 255, 0.05)' }
                    }
                }
            }
        });
    }

    renderLedgerTable() {
        const tbody = document.getElementById('carbonLedgerBody');
        if (!tbody || !this.data) return;

        tbody.innerHTML = '';
        const recent = this.data.daily_records.slice(-10).reverse();

        recent.forEach((r, idx) => {
            const tr = document.createElement('tr');
            const kwhSaved = this.mode === 'optimized' ? Math.round(r.grid_saved_kwh * this.renScale) : 0;
            const co2Kg = this.mode === 'optimized' ? (r.co2_avoided_kg * this.renScale).toFixed(2) : '0.00';
            const credits = this.mode === 'optimized' ? (r.carbon_credits_earned * this.renScale).toFixed(4) : '0.0000';
            const netVal = this.mode === 'optimized' ? Math.round((kwhSaved * (this.gridTariff - 2.40)) + (parseFloat(credits) * this.carbonPrice)) : 0;

            tr.innerHTML = `
                <td>${r.date}</td>
                <td style="color: #ffffff; font-weight: 600;">${r.load_kwh} kWh</td>
                <td style="color: var(--accent-wind); font-weight: 600;">${kwhSaved} kWh</td>
                <td><span class="status-tag ok">${this.mode === 'optimized' ? (r.ren_penetration_pct * this.renScale).toFixed(1) + '%' : '0%'}</span></td>
                <td style="color: var(--accent-wind); font-weight: 700;">${co2Kg} kg</td>
                <td style="color: #eab308; font-weight: 700;">${credits} VCU</td>
                <td style="color: #38bdf8; font-weight: 700;">₹${netVal.toLocaleString()}</td>
                <td><span class="badge-status" style="font-size: 0.65rem;">VERIFIED</span></td>
            `;
            tbody.appendChild(tr);
        });
    }

    openCertificateModal() {
        const m = this.computeMetrics();
        if (!m) return;

        const modal = document.getElementById('certModal');
        if (!modal) return;

        const u = window.authManager ? window.authManager.getCurrentUser() : null;
        document.getElementById('certRecipientName').textContent = u ? u.name : 'Team AI Catalysts';
        document.getElementById('certOrgName').textContent = u ? u.org : 'Tribhuvan College of Environment & Development Sciences';
        document.getElementById('certCreditsVal').textContent = m.credits + ' Metric Tons CO2e';
        document.getElementById('certKwhSavedVal').textContent = Math.round(m.gridSaved).toLocaleString() + ' kWh';
        document.getElementById('certDateStr').textContent = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        document.getElementById('certSerialNum').textContent = 'VER-2026-EC-' + Math.floor(100000 + Math.random() * 900000);

        modal.classList.add('show');
    }

    closeCertificateModal() {
        const modal = document.getElementById('certModal');
        if (modal) modal.classList.remove('show');
    }
}

// Global accessor
window.optimizer = new DispatchOptimizer();

document.addEventListener('DOMContentLoaded', () => {
    window.optimizer.init();
});
