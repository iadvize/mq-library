# Work In Progress \#LiveTeam

## Usage

```javascript
require('iadvize-amqp/transaction-service').connect(function(err, amqp){
    amqp.publish();
    amqp.consume('transaction-service');
});
```

// A la connexion :
// amqp -> créer echanges/queues si ça n'existe pas
// amqp -> vérifier le type des bindings/queue & echange, si pas compatible => crash


// En cas de mauvais nom de queue : 
// - proposer une correction orthographique (distance de levenshtein)s
// - donner le nom réel de la queue

// json-schema pour la documentation ?


## Gestion du diff de version entre la production le "master" sur dev

- Avant chaque test : loader le schéma RabbitMQ de production
- Lancer les tests (qui vont vérifier que le schema match)
    + > crash du test 
    +   -> forcer le test en unstable
    +   -> alerte le dev/devops qu'il doit une modification en production
    +   -> une fois la modification faite
    +       -> relancer la build
