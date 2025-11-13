import json
import streamlit as st
import plotly.graph_objects as go
from pathlib import Path

# ------------------------------
# Load data
# ------------------------------
# Replace with your JSON file path
DATA_FILE = Path("output_20251113102019.json")

with open(DATA_FILE, "r") as f:
    data = json.load(f)

berth = data["berths"][0]
ship = berth["ship"]
radars = berth["radars"]
bollards = berth["bollards"]

st.set_page_config(page_title="Mooring Visualisation", layout="wide")
st.title(f"⚓ Mooring Visualisation – {data['name']} – {berth['name']}")
st.subheader(f"Ship: {ship['name']} (ID {ship['vesselId']})")

# ------------------------------
# Compute derived metrics
# ------------------------------
# Get average active radar distance as ship offset
active_radars = [r for r in radars if r["distanceStatus"] == "ACTIVE" and r["shipDistance"] is not None]
avg_distance = sum(r["shipDistance"] for r in active_radars) / len(active_radars) if active_radars else 0

# Compute total tension per bollard
bollard_loads = []
for bollard in bollards:
    total_tension = sum(h["tension"] or 0 for h in bollard["hooks"])
    bollard_loads.append({
        "name": bollard["name"],
        "total_tension": total_tension
    })

# ------------------------------
# Plot berth schematic
# ------------------------------
st.header("Berth Layout (Schematic)")

fig = go.Figure()

# Draw the berth line
fig.add_shape(type="line", x0=0, y0=0, x1=len(bollards)*10, y1=0,
              line=dict(color="black", width=4))

# Plot bollards
x_positions = [i * 10 for i in range(len(bollards))]
for i, (bollard, load) in enumerate(zip(bollards, bollard_loads)):
    x = x_positions[i]
    fig.add_trace(go.Scatter(
        x=[x], y=[0], mode="markers+text",
        marker=dict(size=20, color="lightblue"),
        text=f"{bollard['name']}<br>{load['total_tension']} kN",
        textposition="top center",
        name=bollard["name"]
    ))

# Plot ship as rectangle offset from berth
ship_x = sum(x_positions) / len(x_positions)
fig.add_shape(type="rect",
              x0=ship_x - 15, x1=ship_x + 15,
              y0=avg_distance, y1=avg_distance + 10,
              line=dict(color="blue", width=3),
              fillcolor="lightgrey")
fig.add_annotation(x=ship_x, y=avg_distance + 5, text=ship["name"], showarrow=False)

fig.update_layout(
    xaxis=dict(visible=False),
    yaxis=dict(visible=False),
    width=900, height=400,
    showlegend=False,
    title="Schematic: Berth, Bollards & Ship"
)

st.plotly_chart(fig, use_container_width=True)

# ------------------------------
# Tension per Hook
# ------------------------------
st.header("Hook Tensions")

hook_names = []
tensions = []
faults = []
for bollard in bollards:
    for h in bollard["hooks"]:
        hook_names.append(h["name"])
        tensions.append(h["tension"] if h["tension"] is not None else 0)
        faults.append("⚠️" if h["faulted"] else "")

bar = go.Figure(data=[
    go.Bar(
        x=hook_names,
        y=tensions,
        marker=dict(color=["red" if f == "⚠️" else "steelblue" for f in faults]),
        text=faults,
        textposition="outside"
    )
])
bar.update_layout(
    xaxis_title="Hook",
    yaxis_title="Tension (kN)",
    title="Tension per Hook",
    height=500
)
st.plotly_chart(bar, use_container_width=True)

# ------------------------------
# Active Radar Distances
# ------------------------------
st.header("Active Radar Distances")
if active_radars:
    radar_fig = go.Figure(data=[
        go.Bar(
            x=[r["name"] for r in active_radars],
            y=[r["shipDistance"] for r in active_radars],
            text=[f"{r['distanceChange']:.2f}" for r in active_radars],
            textposition="outside"
        )
    ])
    radar_fig.update_layout(
        xaxis_title="Radar",
        yaxis_title="Ship Distance (m)",
        title="Active Radar Measurements",
        height=400
    )
    st.plotly_chart(radar_fig, use_container_width=True)
else:
    st.info("No active radar data available.")

# ------------------------------
# Summary Metrics
# ------------------------------
st.header("Summary")

num_bollards = len(bollards)
num_hooks = sum(len(b["hooks"]) for b in bollards)

col1, col2, col3, col4 = st.columns(4)
col1.metric("Number of Bollards", num_bollards)
col2.metric("Total Hooks", num_hooks)
col3.metric("Active Radars", len(active_radars))
col4.metric("Average Ship Distance (m)", f"{avg_distance:.2f}")

# Optional: total load row below
total_load = sum(l['total_tension'] for l in bollard_loads)
st.metric("Total Bollard Load (kN)", total_load)

