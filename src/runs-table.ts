import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export type RunRecord = {
    runId: string;
    totalMatchups: number;
    summaryKey: string;
};

export async function putRunRecord(tableName: string, record: RunRecord): Promise<void> {
    await ddb.send(new PutCommand({
        TableName: tableName,
        Item: record,
    }));
}
