import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';

export const SummaryCard: React.FC<{ title: string; summary: string }> = ({
  title,
  summary,
}) => (
  <Card className="border-zinc-800 bg-zinc-950">
    <CardHeader>
      <CardTitle className="text-sm text-zinc-300">{title}</CardTitle>
    </CardHeader>
    <CardContent className="text-sm text-zinc-100">{summary}</CardContent>
  </Card>
);

export default SummaryCard;
