import json
import os
from pymongo import MongoClient

def main():
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
        else:
            if os.environ.get('MONGO_LOCAL_AUTH', 'false').lower() == 'true' and mongo_user and mongo_pass:
                kwargs['username'] = mongo_user
                kwargs['password'] = mongo_pass
        return MongoClient(**kwargs)

    if is_local:
        candidate_hosts = []
        upstream_host = os.environ.get('MONGO_HOST', 'host.docker.internal').strip()
        if upstream_host:
            candidate_hosts.append(upstream_host)
        candidate_hosts.extend(['172.17.0.1', 'localhost'])
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
        client = _connect(os.environ.get('MONGO_HOST', 'host.docker.internal'))

    db = client['Workshop']

    # Load and insert achievements
    with open('achievements.json', 'r') as f:
        achievements = json.load(f)
    db.achievements.insert_many(achievements)
    print("Inserted achievements")

    # Load and insert individuals (employees)
    with open('employees.json', 'r') as f:
        individuals = json.load(f)
    db.individuals.insert_many(individuals)
    print("Inserted individuals")

    # Load and insert teams
    with open('teams.json', 'r') as f:
        teams = json.load(f)
    db.teams.insert_many(teams)
    print("Inserted teams")

    # Load and insert locations
    with open('locations.json', 'r') as f:
        locations = json.load(f)
    db.locations.insert_many(locations)
    print("Inserted locations")

    print("Data insertion complete")

if __name__ == "__main__":
    main()