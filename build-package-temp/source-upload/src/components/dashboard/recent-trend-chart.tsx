"use client";

import { motion } from "framer-motion";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function RecentTrendChart({
  data,
}: {
  data: Array<{ date: string; count: number }>;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="h-[280px] w-full"
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid stroke="rgba(159,176,200,0.12)" vertical={false} />
          <XAxis dataKey="date" stroke="#9fb0c8" tick={{ fontSize: 12 }} />
          <YAxis stroke="#9fb0c8" tick={{ fontSize: 12 }} allowDecimals={false} />
          <Tooltip
            contentStyle={{
              background: "#182334",
              borderRadius: 12,
              border: "1px solid #2d3a4f",
              color: "#e8eef8",
            }}
          />
          <Line type="monotone" dataKey="count" stroke="#316df3" strokeWidth={3} dot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
