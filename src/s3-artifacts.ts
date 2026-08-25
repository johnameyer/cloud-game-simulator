import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { ArtifactRetentionTag, RETENTION_TAG_KEY, type ArtifactRetention } from './artifact-retention.js';

const s3 = new S3Client({});

export { ArtifactRetentionTag, type ArtifactRetention };

export function gameLogKey(runId: string, matchupId: string, gameNumber: number): string {
    return `runs/${runId}/${matchupId}/games/${gameNumber}.log`;
}

export function gameTraceKey(runId: string, matchupId: string, gameNumber: number): string {
    return `runs/${runId}/${matchupId}/games/${gameNumber}.trace.jsonl`;
}

export function matchupSummaryKey(runId: string, matchupId: string): string {
    return `runs/${runId}/${matchupId}/matchup-summary.json`;
}

export function matchupsListKey(runId: string): string {
    return `runs/${runId}/matchups.json`;
}

export function runSummaryKey(runId: string): string {
    return `runs/${runId}/run-summary.json`;
}

export async function putArtifact(bucket: string, key: string, body: string, retention: ArtifactRetention): Promise<void> {
    await s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: 'text/plain',
        Tagging: `${RETENTION_TAG_KEY}=${retention}`,
    }));
}

export async function getObjectJson<T>(bucket: string, key: string): Promise<T> {
    const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const body = await response.Body?.transformToString();
    if (!body) {
        throw new Error(`Empty or missing S3 object body: s3://${bucket}/${key}`);
    }
    return JSON.parse(body) as T;
}
