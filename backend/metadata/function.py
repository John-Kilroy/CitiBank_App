import json
import os
from pymongo import MongoClient

def handler(event=None, context=None):
    """
    AWS Lambda function to fetch metadata (locations) from MongoDB.
    """

    try:
        # Connect to MongoDB
        is_local = os.environ.get('IS_LOCAL', 'false') == 'true'
        mongo_port = int(os.environ.get('MONGO_PORT', 27017))
        mongo_user = os.environ.get('MONGO_USER', '').strip()
        mongo_pass = os.environ.get('MONGO_PASS', '').strip()

        def _connect(host):
            kwargs = {'host': host, 'port': mongo_port, 'serverSelectionTimeoutMS': 3000}
            if not is_local:
                if mongo_user and mongo_pass:
                    kwargs['username'] = mongo_user
                    kwargs['password'] = mongo_pass
                kwargs['tls'] = True
                kwargs['tlsAllowInvalidCertificates'] = True
                kwargs['retryWrites'] = False
            return MongoClient(**kwargs)

        if is_local:
            candidate_hosts = []
            upstream_host = os.environ.get('MONGO_HOST', 'localhost').strip()
            if upstream_host:
                candidate_hosts.append(upstream_host)
            candidate_hosts.extend(['host.docker.internal', '172.17.0.1', 'localhost'])
            candidate_hosts = list(dict.fromkeys(candidate_hosts))

            client = None
            last_exc = None
            for h in candidate_hosts:
                try:
                    client = _connect(h)
                    client.server_info()
                    break
                except Exception as ex:
                    last_exc = ex
            if client is None:
                raise last_exc or RuntimeError('Unable to connect to local MongoDB')
        else:
            client = _connect(os.environ.get('MONGO_HOST', 'localhost'))

        db = client['Workshop']
        collection = db['locations']

        # Fetch all locations
        locations = list(collection.find({}, {'_id': 0}))

        return {
            "statusCode": 200,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps(locations, default=str),
        }
    except Exception as e:
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": str(e)}),
        }

if __name__ == "__main__":
    print(handler())