import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({});

export function gameLogKey(runId: string, matchupId: string, gameNumber: number): string {
    return `runs/${runId}/${matchupId}/games/${gameNumber}.log`;
}

export function gameTraceKey(runId: string, matchupId: string, gameNumber: number): string {
    return `runs/${runId}/${matchupId}/games/${gameNumber}.trace.jsonl`;
}

export function matchupSummaryKey(runId: string, matchupId: string): string {
    return `runs/${runId}/${matchupId}/matchup-summary.json`;
}

export async function putArtifact(bucket: string, key: string, body: string): Promise<void> {
    await s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: 'text/plain',
    }));
}
