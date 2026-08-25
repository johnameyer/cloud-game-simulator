import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import type { MatchupSummary } from './types.js';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export async function putMatchupSummary(tableName: string, summary: MatchupSummary): Promise<void> {
    await ddb.send(new PutCommand({
        TableName: tableName,
        Item: summary,
    }));
}

export async function queryMatchupSummaries(tableName: string, runId: string): Promise<MatchupSummary[]> {
    const summaries: MatchupSummary[] = [];
    let exclusiveStartKey: Record<string, unknown> | undefined;

    do {
        const response = await ddb.send(new QueryCommand({
            TableName: tableName,
            KeyConditionExpression: 'runId = :runId',
            ExpressionAttributeValues: { ':runId': runId },
            ExclusiveStartKey: exclusiveStartKey,
        }));
        summaries.push(...(response.Items ?? []) as MatchupSummary[]);
        exclusiveStartKey = response.LastEvaluatedKey;
    } while (exclusiveStartKey);

    return summaries;
}
